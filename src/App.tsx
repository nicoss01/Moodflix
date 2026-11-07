import {useEffect, useMemo, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {Routes, Route, useLocation, useNavigate, NavLink, Navigate} from 'react-router-dom'
import {ArrowLeft, Captions, Check, ChevronDown, ChevronLeft, ChevronRight, CircleUserRound, Dice5, Download, Eye, EyeOff, Film, Gamepad2, Gauge, GitCommitHorizontal, HardDrive, Headphones, Home, Info, Keyboard, Languages, ListVideo, LoaderCircle, MonitorCog, Pause, PawPrint, Play, Plus, Power, QrCode, RefreshCw, Rocket, Search, Send, Settings, ShieldCheck, SkipBack, SkipForward, Sparkles, Star, Subtitles, Trash2, Tv, Upload, UserPlus, UserRound, Volume2, VolumeX, X} from 'lucide-react'
import {api, type DriveInfo, type DriveScan, type EpisodeLink, type Media, type OmdbTestResult, type Profile, type ProfilePreferences, type QbitTestResult, type Recommendation, type SeriesGroup, type TorrentResult, type TorznabTestResult, type UpdateStatus} from './api'

const art: Record<string, string> = {
  'gradient:sand': 'linear-gradient(135deg,#bc5b20,#321509 62%,#090d13)',
  'gradient:space': 'radial-gradient(circle at 25% 30%,#69879d,#162839 35%,#05070e 78%)',
  'gradient:forest': 'linear-gradient(145deg,#365f4b,#102820 52%,#071119)',
  'gradient:ice': 'linear-gradient(145deg,#8cc5dc,#265069 48%,#09121d)',
  'gradient:violet': 'linear-gradient(145deg,#884ec5,#281940 52%,#080916)',
  'gradient:dune': 'radial-gradient(circle at 80% 35%,#e59043,#6b2c19 28%,#131015 68%)',
  'gradient:interstellar': 'radial-gradient(circle at 78% 38%,#f8d399,#604631 18%,#0b1b28 48%,#02060d 75%)',
}

function mediaArt(value?: string) {
  if (!value) return {}
  if (art[value]) return {background: art[value]}
  if (/^https?:\/\//i.test(value) || value.startsWith('/'))
    return {
      backgroundImage: `url("${value.replace(/"/g, '%22')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  return {}
}

function Logo({compact = false}: {compact?: boolean}) {
  return (
    <div className={`brand-logo ${compact ? 'compact' : ''}`} aria-label="MoodFlix">
      <img src="/assets/moodflix-logo.png" alt="MoodFlix" />
    </div>
  )
}

function useRemoteNavigation() {
  const location = useLocation(),
    navigate = useNavigate()
  useEffect(() => {
    window.scrollTo({top: 0, left: 0, behavior: 'auto'})
    const activeModal = () => [...document.querySelectorAll<HTMLElement>('[data-tv-modal]')].find((element) => !element.classList.contains('modal-wrap') || element.classList.contains('open')) || null
    const focusFirst = () => {
      if (!(document.activeElement instanceof HTMLElement) || document.activeElement === document.body) (document.querySelector('[data-focus]') as HTMLElement)?.focus()
    }
    const timer = setTimeout(focusFirst, 80)
    let previousFocus: HTMLElement | null = null,
      lastModal: HTMLElement | null = null
    const syncModalFocus = () => {
      const modal = activeModal()
      if (modal && !lastModal) previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (modal && modal !== lastModal) {
        lastModal = modal
        requestAnimationFrame(() => modal.querySelector<HTMLElement>('[data-focus]:not([disabled])')?.focus())
      } else if (!modal && lastModal) {
        lastModal = null
        if (previousFocus?.isConnected) previousFocus.focus()
        previousFocus = null
      }
    }
    const observer = new MutationObserver(syncModalFocus)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'aria-hidden'],
    })
    syncModalFocus()
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const modal = activeModal()
      if (event.key === 'Tab' && modal) {
        const nodes = [...modal.querySelectorAll<HTMLElement>('[data-focus]:not([disabled])')].filter((node) => node.offsetParent !== null)
        if (nodes.length) {
          event.preventDefault()
          const index = Math.max(0, nodes.indexOf(document.activeElement as HTMLElement))
          nodes[(index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length].focus()
        }
        return
      }
      const readOnlyTrigger = target instanceof HTMLInputElement && target.readOnly && (event.key === 'Enter' || event.key === ' ')
      const editableText = (target instanceof HTMLInputElement && !target.readOnly) || target instanceof HTMLTextAreaElement
      if (event.key === 'Escape' || (event.key === 'Backspace' && !editableText)) {
        event.preventDefault()
        if (modal) {
          const close = modal.querySelector<HTMLElement>('[data-modal-close]')
          if (close) close.click()
          else window.dispatchEvent(new CustomEvent('moodflix:close-overlay'))
        } else if (location.pathname.startsWith('/watch/')) window.dispatchEvent(new CustomEvent('moodflix:exit-player'))
        else navigate(-1)
        return
      }
      if (['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO'].includes(target?.tagName) && !readOnlyTrigger) return
      if (event.key === 'Enter' || event.key === ' ') {
        const active = document.activeElement as HTMLElement
        if (active?.matches('button,a,[role="button"],input[readonly]')) {
          event.preventDefault()
          active.click()
        }
        return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const current = document.activeElement as HTMLElement
      const scope = modal || document
      const nodes = [...scope.querySelectorAll<HTMLElement>('[data-focus]:not([disabled])')].filter((n) => n.offsetParent !== null)
      if (!nodes.length) return
      const source = current?.getBoundingClientRect?.() || nodes[0].getBoundingClientRect()
      const direction = event.key.replace('Arrow', '').toLowerCase()
      const focusTarget = current?.getAttribute(`data-focus-${direction}`)
      if (focusTarget) {
        const explicit = document.querySelector<HTMLElement>(focusTarget)
        if (explicit) {
          event.preventDefault()
          explicit.focus()
          return
        }
      }
      const candidate = nodes
        .filter((n) => n !== current)
        .map((n) => {
          const r = n.getBoundingClientRect(),
            dx = r.left + r.width / 2 - (source.left + source.width / 2),
            dy = r.top + r.height / 2 - (source.top + source.height / 2)
          const valid = direction === 'left' ? dx < 0 : direction === 'right' ? dx > 0 : direction === 'up' ? dy < 0 : dy > 0
          const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy),
            cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx)
          return {n, valid, score: primary + cross * 2.2}
        })
        .filter((x) => x.valid)
        .sort((a, b) => a.score - b.score)[0]
      if (candidate) {
        event.preventDefault()
        candidate.n.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    const remote = new EventSource('/api/remote/events')
    remote.onmessage = (event) => {
      const {key, type = 'keydown'} = JSON.parse(event.data) as {
        key: string
        type?: 'keydown' | 'keyup'
      }
      if (key === 'MediaPlayPause' && type === 'keydown') window.dispatchEvent(new CustomEvent('moodflix:playpause'))
      else (document.activeElement instanceof HTMLElement ? document.activeElement : window).dispatchEvent(new KeyboardEvent(type, {key, bubbles: true}))
    }
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      remote.close()
      window.removeEventListener('keydown', onKey)
    }
  }, [location.pathname, navigate])
}

function App() {
  useRemoteNavigation()
  const [profile, setProfile] = useState<Profile | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('moodflix-profile') || 'null')
    } catch {
      return null
    }
  })
  const choose = (p: Profile) => {
    localStorage.setItem('moodflix-profile', JSON.stringify(p))
    setProfile(p)
  }
  return (
    <>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/profiles" element={<Profiles onChoose={choose} />} />
        <Route
          path="/home"
          element={
            <Shell profile={profile} onChoose={choose}>
              <HomeScreen profile={profile} />
            </Shell>
          }
        />
        <Route
          path="/recommendations"
          element={
            <Shell profile={profile} onChoose={choose}>
              <RecommendationsPage profile={profile} />
            </Shell>
          }
        />
        <Route
          path="/movies"
          element={
            <Shell profile={profile} onChoose={choose}>
              <Library kind="movie" profile={profile} />
            </Shell>
          }
        />
        <Route
          path="/series"
          element={
            <Shell profile={profile} onChoose={choose}>
              <SeriesLibrary profile={profile} />
            </Shell>
          }
        />
        <Route
          path="/details/media/:id"
          element={
            <Shell profile={profile} onChoose={choose}>
              <MediaDetailPage profile={profile} />
            </Shell>
          }
        />
        <Route
          path="/details/series"
          element={
            <Shell profile={profile} onChoose={choose}>
              <SeriesDetailPage profile={profile} />
            </Shell>
          }
        />
        <Route
          path="/details/catalog/:catalogId"
          element={
            <Shell profile={profile} onChoose={choose}>
              <CatalogDetailPage profile={profile} />
            </Shell>
          }
        />
        <Route
          path="/torrents"
          element={
            <Shell profile={profile} onChoose={choose}>
              <Torrents />
            </Shell>
          }
        />
        <Route path="/torrent-search" element={<TorrentRemoteSearch />} />
        <Route path="/recommendation-preferences" element={<RecommendationPreferencesPage />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/watch/:id" element={<Player profile={profile} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ScreenSaverController />
    </>
  )
}

const loadingBackgrounds = ['moodflix_loading_animaux.png', 'moodflix_loading_cinema.png', 'moodflix_loading_espace.png', 'moodflix_loading_geek_fantasy.png', 'moodflix_loading_jeux_video.png', 'moodflix_loading_musique.png']
function Splash() {
  const nav = useNavigate(),
    [progress, setProgress] = useState(12),
    [background] = useState(() => loadingBackgrounds[Math.floor(Math.random() * loadingBackgrounds.length)])
  useEffect(() => {
    const t = setInterval(() => setProgress((p) => Math.min(100, p + 7)), 90)
    const go = setTimeout(async () => {
      const state = await api.onboarding().catch(() => ({complete: false}))
      nav(state.complete ? '/profiles' : '/onboarding')
    }, 1500)
    return () => {
      clearInterval(t)
      clearTimeout(go)
    }
  }, [nav])
  return createPortal(
    <main className="splash">
      <div className="splash-art" role="img" aria-label="Ambiance MoodFlix" style={{backgroundImage: `url(/assets/loading/${background})`}} />
      <section>
        <Logo />
        <h2>Préparation de votre expérience…</h2>
        <div className="load-row">
          <div className="progress">
            <i style={{width: `${progress}%`}} />
          </div>
          <strong>{progress} %</strong>
        </div>
        <div className="boot-icons">
          <Film />
          <Tv />
          <Download />
          <HardDrive />
          <Gauge />
        </div>
      </section>
      <button className="skip" onClick={() => nav('/onboarding')}>
        Passer
      </button>
    </main>,
    document.body,
  )
}

function ScreenSaverController() {
  const location = useLocation(),
    [active, setActive] = useState(false)
  useEffect(() => {
    const playing = location.pathname.startsWith('/watch/')
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      if (timer) clearTimeout(timer)
      if (!playing && !active) timer = setTimeout(() => setActive(true), 120_000)
    }
    const activity = (event: Event) => {
      if (active) {
        event.preventDefault()
        event.stopPropagation()
        if ('stopImmediatePropagation' in event) event.stopImmediatePropagation()
        setActive(false)
        return
      }
      arm()
    }
    const events = ['keydown', 'pointerdown', 'pointermove', 'touchstart'] as const
    events.forEach((name) =>
      window.addEventListener(name, activity, {
        capture: true,
        passive: false,
      }),
    )
    if (playing) setActive(false)
    else arm()
    return () => {
      if (timer) clearTimeout(timer)
      events.forEach((name) =>
        window.removeEventListener(name, activity, {
          capture: true,
        } as EventListenerOptions),
      )
    }
  }, [location.pathname, active])
  return active ? <DvdScreenSaver /> : null
}

function DvdScreenSaver() {
  const logo = useRef<HTMLDivElement>(null)
  useEffect(() => {
    document.documentElement.classList.add('moodflix-screensaver-active')
    let frame = 0,
      last = performance.now(),
      x = Math.random() * Math.max(1, innerWidth - 330),
      y = Math.random() * Math.max(1, innerHeight - 150),
      vx = 150,
      vy = 115,
      hue = 0
    const move = (now: number) => {
      const element = logo.current
      if (!element) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      x += vx * dt
      y += vy * dt
      const maxX = Math.max(0, innerWidth - element.offsetWidth),
        maxY = Math.max(0, innerHeight - element.offsetHeight)
      let bounced = false
      if (x <= 0 || x >= maxX) {
        x = Math.max(0, Math.min(maxX, x))
        vx *= -1
        bounced = true
      }
      if (y <= 0 || y >= maxY) {
        y = Math.max(0, Math.min(maxY, y))
        vy *= -1
        bounced = true
      }
      if (bounced) {
        hue = (hue + 67) % 360
        element.style.filter = `hue-rotate(${hue}deg) drop-shadow(0 0 28px rgba(242,29,69,.4))`
      }
      element.style.transform = `translate3d(${x}px,${y}px,0)`
      frame = requestAnimationFrame(move)
    }
    frame = requestAnimationFrame(move)
    return () => {
      cancelAnimationFrame(frame)
      document.documentElement.classList.remove('moodflix-screensaver-active')
    }
  }, [])
  return createPortal(
    <div className="dvd-screensaver" role="dialog" aria-label="Écran de veille MoodFlix">
      <div ref={logo} className="dvd-logo">
        <img src="/assets/moodflix-logo.png" alt="MoodFlix" />
      </div>
      <small>Appuyez sur une touche pour reprendre</small>
    </div>,
    document.body,
  )
}

function Onboarding() {
  const nav = useNavigate(),
    [qr, setQr] = useState<{url: string; qr: string} | null>(null)
  useEffect(() => {
    api.qr().then(setQr)
    const poll = setInterval(
      () =>
        api.onboarding().then((s) => {
          if (s.complete) nav('/profiles')
        }),
      1800,
    )
    return () => clearInterval(poll)
  }, [nav])
  return (
    <main className="onboarding-screen">
      <Logo />
      <section className="onboarding-copy">
        <span className="eyebrow">PREMIÈRE INSTALLATION</span>
        <h1>Créons vos profils</h1>
        <p>Scannez le QR code avec un téléphone connecté au même réseau que MoodFlix. Ajoutez les membres du foyer et choisissez leur limite d’âge.</p>
        <ol>
          <li>
            <b>1</b> Scannez le code
          </li>
          <li>
            <b>2</b> Créez ou modifiez les profils
          </li>
          <li>
            <b>3</b> Appuyez sur « Terminer » sur le téléphone
          </li>
        </ol>
        <div className="waiting">
          <LoaderCircle className="spin" /> En attente de la configuration mobile…
        </div>
        <button data-focus className="ghost-pill" onClick={() => api.completeOnboarding().then(() => nav('/profiles'))}>
          Configurer plus tard
        </button>
      </section>
      <aside className="onboarding-qr">
        {qr ? (
          <>
            <img src={qr.qr} alt="QR code de configuration" />
            <small>{qr.url}</small>
          </>
        ) : (
          <LoaderCircle className="spin" />
        )}
      </aside>
    </main>
  )
}

function avatarIcon(name: string) {
  if (name === 'arcade') return <Gamepad2 />
  if (name === 'fox') return <PawPrint />
  if (name === 'dreamer') return <Headphones />
  return <Rocket />
}
function Profiles({onChoose}: {onChoose: (p: Profile) => void}) {
  const nav = useNavigate(),
    [profiles, setProfiles] = useState<Profile[]>([])
  useEffect(() => {
    api.profiles().then(setProfiles)
  }, [])
  return (
    <main className="profiles-screen">
      <Logo compact />
      <section>
        <h1>Qui regarde ?</h1>
        <div className="profile-list">
          {profiles.map((p, i) => (
            <button
              key={p.id}
              data-focus
              autoFocus={i === 0}
              className="profile"
              onClick={() => {
                onChoose(p)
                nav('/home')
              }}
              style={{'--profile': p.color} as any}
            >
              <span className={`avatar avatar-${p.avatar}`}>{avatarIcon(p.avatar)}</span>
              <b>{p.name}</b>
              {p.is_admin ? <small>♛</small> : null}
            </button>
          ))}
          <button data-focus className="profile" onClick={() => nav('/home')}>
            <span className="avatar guest">
              <CircleUserRound />
            </span>
            <b>Invité</b>
          </button>
        </div>
        <button data-focus className="ghost-pill" onClick={() => nav('/settings')}>
          <Settings /> Gérer les profils
        </button>
      </section>
      <div className="red-beam left" />
      <div className="red-beam right" />
    </main>
  )
}

function Shell({children, profile, onChoose}: {children: any; profile: Profile | null; onChoose: (profile: Profile) => void}) {
  return (
    <main className="app-shell">
      <Header profile={profile} onChoose={onChoose} />
      {children}
    </main>
  )
}
function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const rawDate = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)
  const date = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)
  const time = now.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <div className="topbar-clock" aria-label={`${date}, ${time}`}>
      <span>{date}</span>
      <time dateTime={now.toISOString()}>{time}</time>
    </div>
  )
}
function Header({profile, onChoose}: {profile: Profile | null; onChoose: (profile: Profile) => void}) {
  const [gameOpen, setGameOpen] = useState(false)
  return (
    <>
      <header className="topbar">
        <Logo compact />
        <nav>
          <ProfileSwitcher profile={profile} onChoose={onChoose} />
          <NavLink data-focus to="/home">
            <Home /> Accueil
          </NavLink>
          <NavLink data-focus to="/recommendations">
            <Sparkles /> Recommandations
          </NavLink>
          <NavLink data-focus to="/movies">
            <Film /> Films
          </NavLink>
          <NavLink data-focus to="/series">
            <Tv /> Séries
          </NavLink>
          <NavLink data-focus data-focus-down="#torrent-search-input" to="/torrents">
            <Download /> Torrent
          </NavLink>
          <button data-focus onClick={() => setGameOpen(true)}>
            <Dice5 /> Qui aura la télécommande ?
          </button>
          <NavLink data-focus to="/settings">
            <Settings /> Paramètres
          </NavLink>
        </nav>
        <Clock />
      </header>
      {gameOpen && <RemoteControlGame onClose={() => setGameOpen(false)} />}
    </>
  )
}

function ProfileSwitcher({profile, onChoose}: {profile: Profile | null; onChoose: (profile: Profile) => void}) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [phase, setPhase] = useState<'idle' | 'closing' | 'loading' | 'opening'>('idle')
  const [target, setTarget] = useState<Profile | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    const close = () => setOpen(false)
    window.addEventListener('moodflix:close-overlay', close)
    return () => {
      window.removeEventListener('moodflix:close-overlay', close)
      timers.current.forEach(clearTimeout)
    }
  }, [])
  const show = async () => {
    const items = await api.profiles()
    setProfiles(items)
    setOpen(true)
  }
  const wait = (delay: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delay)
      timers.current.push(timer)
    })
  const select = async (next: Profile) => {
    if (next.id === profile?.id) {
      setOpen(false)
      return
    }
    setTarget(next)
    setOpen(false)
    setPhase('closing')
    await wait(520)
    setPhase('loading')
    onChoose(next)
    await Promise.allSettled([api.continueWatching(next.id), api.profilePreferences(next.id)])
    await wait(420)
    setPhase('opening')
    await wait(620)
    setPhase('idle')
    setTarget(null)
    nav('/home', {replace: true})
  }
  const message = phase === 'closing' ? 'Fermeture de la session…' : phase === 'loading' ? `Chargement du profil de ${target?.name}…` : `Bienvenue ${target?.name}`
  return (
    <>
      <div className="profile-switcher">
        <button data-focus className="profile-switch-button" onClick={show} aria-label={`Profil actif : ${profile?.name || 'aucun profil'}`} aria-haspopup="menu" aria-expanded={open}>
          <span style={{background: profile?.color}}>{profile ? avatarIcon(profile.avatar) : <UserRound />}</span>
          <b>{profile?.name || 'Profil'}</b>
          <ChevronDown />
        </button>
        {open && (
          <>
            <button className="profile-switch-backdrop" onClick={() => setOpen(false)} aria-label="Fermer la liste des profils" />
            <div className="profile-switch-menu" data-tv-modal role="menu" aria-label="Changer de profil">
              <button data-modal-close className="profile-menu-dismiss" onClick={() => setOpen(false)} aria-label="Fermer" />
              <small>CHANGER DE PROFIL</small>
              {profiles.map((item) => (
                <button data-focus role="menuitem" key={item.id} onClick={() => select(item)}>
                  <span style={{background: item.color}}>{avatarIcon(item.avatar)}</span>
                  <b>{item.name}</b>
                  <em>{item.max_age}+</em>
                  {item.id === profile?.id && <Check />}
                </button>
              ))}
              <NavLink data-focus to="/profiles">
                <Settings /> Gérer les profils
              </NavLink>
            </div>
          </>
        )}
      </div>
      {phase !== 'idle' && (
        <div className={`profile-transition ${phase}`} aria-live="polite">
          <div className="transition-panel top" />
          <div className="transition-panel bottom" />
          <section>
            <span style={{background: target?.color}}>{target && avatarIcon(target.avatar)}</span>
            <b>{message}</b>
            {phase === 'loading' && <LoaderCircle className="spin" />}
          </section>
        </div>
      )}
    </>
  )
}

function RemoteControlGame({onClose}: {onClose: () => void}) {
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [selected, setSelected] = useState<number[]>([]),
    [phase, setPhase] = useState<'choose' | 'spinning' | 'result'>('choose'),
    [highlighted, setHighlighted] = useState<number | null>(null),
    [winner, setWinner] = useState<Profile | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    api.profiles().then((items) => {
      setProfiles(items)
      setSelected(items.map((item) => item.id))
    })
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])
  useEffect(() => {
    if (phase === 'result') requestAnimationFrame(() => (document.querySelector('.remote-game-result [data-focus]') as HTMLElement)?.focus())
  }, [phase])
  const toggle = (id: number) => phase === 'choose' && setSelected((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]))
  const launch = () => {
    const players = profiles.filter((item) => selected.includes(item.id))
    if (!players.length) return
    setPhase('spinning')
    setWinner(null)
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000
    const winnerIndex = Math.floor(random * players.length)
    const total = players.length * 5 + winnerIndex
    let step = 0
    const tick = () => {
      const current = players[step % players.length]
      setHighlighted(current.id)
      if (step >= total) {
        setWinner(current)
        setPhase('result')
        return
      }
      const progress = step / total
      step++
      timer.current = setTimeout(tick, 70 + Math.round(progress ** 3 * 600))
    }
    tick()
  }
  const replay = () => {
    setPhase('choose')
    setWinner(null)
    setHighlighted(null)
  }
  const colors = ['#f21d45', '#ffd34d', '#54e89a', '#65a6ff', '#bb72ff', '#ff8a4d']
  return (
    <div className="tv-overlay" data-tv-modal role="dialog" aria-modal="true" aria-label="Qui aura la télécommande ?">
      <div className="remote-game">
        <button data-focus data-modal-close className="modal-close" onClick={onClose}>
          <X />
        </button>
        <Dice5 className="game-dice" />
        <span className="eyebrow">TIRAGE AU SORT</span>
        <h2>Qui aura la télécommande ?</h2>
        {phase !== 'result' ? (
          <>
            <p>{phase === 'choose' ? 'Choisissez les participants puis lancez le tirage.' : 'La chance est en train de choisir…'}</p>
            <div className="game-profiles">
              {profiles.map((player) => (
                <button data-focus disabled={phase === 'spinning'} key={player.id} className={`${selected.includes(player.id) ? 'selected' : ''} ${highlighted === player.id ? 'highlighted' : ''}`} onClick={() => toggle(player.id)}>
                  <span className="game-avatar" style={{background: player.color}}>
                    {avatarIcon(player.avatar)}
                  </span>
                  <b>{player.name}</b>
                  {selected.includes(player.id) && phase === 'choose' && <Check />}
                </button>
              ))}
            </div>
            <button data-focus className="primary game-launch" disabled={phase === 'spinning' || !selected.length} onClick={launch}>
              <Dice5 className={phase === 'spinning' ? 'rolling' : ''} /> {phase === 'spinning' ? 'Tirage en cours…' : 'Lancer'}
            </button>
          </>
        ) : (
          <div className="remote-game-result">
            <div className="confetti" aria-hidden="true">
              {Array.from({length: 32}, (_, index) => (
                <i
                  key={index}
                  style={
                    {
                      '--x': `${(index * 37) % 100}%`,
                      '--delay': `${(index % 8) * 0.08}s`,
                      '--color': colors[index % colors.length],
                    } as any
                  }
                />
              ))}
            </div>
            <span className="winner-avatar" style={{background: winner?.color}}>
              {winner && avatarIcon(winner.avatar)}
            </span>
            <h3>{winner?.name} prend la télécommande !</h3>
            <p>Le hasard a parlé. Bonne soirée cinéma !</p>
            <div>
              <button data-focus onClick={replay}>
                <RefreshCw /> Rejouer
              </button>
              <button data-focus data-modal-close className="primary" onClick={onClose}>
                <Check /> C’est parti
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function useMedia(kind?: string, profileId?: number) {
  const [items, setItems] = useState<Media[]>([]),
    [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    api
      .media(kind, profileId)
      .then(setItems)
      .finally(() => setLoading(false))
  }, [kind, profileId])
  return {items, loading}
}
function isWatched(item: Media) {
  return Boolean(item.completed) || Boolean(item.duration && item.position !== undefined && item.position / item.duration >= 0.95)
}
function WatchStatus({item, episode = false}: {item: Media; episode?: boolean}) {
  if (isWatched(item))
    return (
      <span className={episode ? 'episode-watched' : 'watched-badge'} title="Déjà vu">
        <Check />
        {episode && ' Vu'}
      </span>
    )
  if ((item.position || 0) > 0)
    return (
      <span className={episode ? 'episode-started' : 'started-badge'} title="Lecture commencée">
        <Eye />
        {episode && ' En cours'}
      </span>
    )
  return null
}
function mediaRecommendation(item: Media): Recommendation {
  return {
    id: `local:${item.id}`,
    title: item.title,
    kind: item.kind,
    year: item.year,
    genres: item.genres,
    overview: item.overview,
    poster: item.poster,
    backdrop: item.backdrop,
    age_rating: item.age_rating,
    score: 0,
    reason: 'Disponible dans votre bibliothèque MoodFlix',
    available: true,
    localMediaId: item.id,
    source: 'library',
  }
}
function localDetailPath(item: {kind: 'movie' | 'series'; title: string; series_title?: string; id?: number | string; localMediaId?: number}) {
  return item.kind === 'series' ? `/details/series?title=${encodeURIComponent(item.series_title || item.title)}` : `/details/media/${item.localMediaId || item.id}`
}
function recommendationDetailPath(item: Recommendation) {
  if (item.available && item.localMediaId) return localDetailPath(item)
  sessionStorage.setItem(`moodflix-catalog-detail:${item.id}`, JSON.stringify(item))
  return `/details/catalog/${encodeURIComponent(item.id)}`
}
function collapseSeriesMedia(items: Media[]) {
  const unique = new Map<string, Media>()
  for (const item of items) {
    const seriesTitle = (item.series_title || item.title).trim(),
      key = item.kind === 'series' ? `series:${seriesTitle.toLocaleLowerCase('fr')}` : `movie:${item.id}`
    if (!unique.has(key)) unique.set(key, item.kind === 'series' ? {...item, title: seriesTitle} : item)
  }
  return [...unique.values()]
}

function HomeScreen({profile}: {profile: Profile | null}) {
  const {items} = useMedia(undefined, profile?.id),
    [continueItems, setContinueItems] = useState<Media[]>([]),
    [recommendations, setRecommendations] = useState<Recommendation[]>([]),
    [selected, setSelected] = useState<Recommendation | null>(null),
    nav = useNavigate()
  useEffect(() => {
    let active = true
    if (!profile) {
      setContinueItems([])
      return
    }
    api
      .continueWatching(profile.id)
      .then((next) => active && setContinueItems(next))
      .catch(() => active && setContinueItems([]))
    return () => {
      active = false
    }
  }, [profile?.id])
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const next = profile ? (await api.profileRecommendations(profile.id, 1)).items : []
        if (active && next.length) setRecommendations(next)
        else if (active) {
          const [movies, series] = await Promise.all([api.trending('movie', profile?.id), api.trending('series', profile?.id)])
          if (active) setRecommendations([...movies, ...series])
        }
      } catch {
        if (active)
          Promise.all([api.trending('movie', profile?.id), api.trending('series', profile?.id)])
            .then(([movies, series]) => active && setRecommendations([...movies, ...series]))
            .catch(() => active && setRecommendations([]))
      }
    }
    setRecommendations([])
    void load()
    return () => {
      active = false
    }
  }, [profile?.id])
  const hero = continueItems[0] || items[0],
    resumeItems = continueItems.slice(1)
  const localFallback = useMemo(() => collapseSeriesMedia(items).map(mediaRecommendation), [items])
  const recommendationPool = recommendations.length ? recommendations : localFallback
  const movies = recommendationPool.filter((item) => item.kind === 'movie').slice(0, 12)
  const series = recommendationPool.filter((item) => item.kind === 'series').slice(0, 12)
  const resuming = Boolean(continueItems[0] && hero?.id === continueItems[0].id)
  return (
    <div className="home-content">
      {hero ? (
        <section className="hero" style={mediaArt(hero.backdrop || hero.poster)}>
          <div className="hero-noise" />
          <div className="hero-copy">
            <div className="eyebrow">
              <b>{resuming ? 'À REPRENDRE' : hero.kind === 'movie' ? 'Film' : 'Série'}</b>
              {hero.genres.join(' • ')}
            </div>
            <h1>{hero.title}</h1>
            <p>{hero.overview || 'Votre prochaine grande histoire vous attend.'}</p>
            {resuming && hero.duration > 0 && (
              <div className="hero-resume-progress">
                <i
                  style={{
                    width: `${Math.min(100, ((hero.position || 0) / hero.duration) * 100)}%`,
                  }}
                />
                <span>{Math.round((hero.position || 0) / 60)} min vues</span>
              </div>
            )}
            <div className="actions">
              <button data-focus className="primary" onClick={() => nav(`/watch/${hero.id}`)}>
                <Play fill="currentColor" /> {resuming ? 'Reprendre' : 'Regarder'}
              </button>
              <button data-focus onClick={() => nav(localDetailPath(hero))}>
                <Info /> Détails
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="empty-library-hero">
          <Sparkles />
          <div>
            <span className="eyebrow">DÉCOUVRIR</span>
            <h1>Les tendances du moment</h1>
            <p>Votre bibliothèque est vide. Voici les titres populaires à rechercher et télécharger depuis vos sources configurées.</p>
          </div>
        </section>
      )}
      {resumeItems.length > 0 && <MediaRow title="Reprendre la lecture" icon={<Play />} items={resumeItems} profileId={profile?.id} />}
      {movies.length > 0 && <RecommendationRow title="Films recommandés" icon={<Film />} items={movies} onSelect={setSelected} moreTo="/recommendations" />}
      {series.length > 0 && <RecommendationRow title="Séries recommandées" icon={<Tv />} items={series} onSelect={setSelected} moreTo="/recommendations" />}
      <section className="tonight">
        <div>
          <b>
            <span>🧠</span> On regarde quoi ce soir ?
          </b>
          <p>Une sélection équilibrée selon les goûts de {profile?.name || 'vos profils'} et de vos proches</p>
        </div>
        <button data-focus onClick={() => document.getElementById('recommend-modal')?.classList.add('open')}>
          <Sparkles /> Me proposer une sélection
        </button>
      </section>
      <RecommendModal />
      {selected && <RecommendationDetails item={selected} profileId={profile?.id} onClose={() => setSelected(null)} />}
    </div>
  )
}

function RecommendationsPage({profile}: {profile: Profile | null}) {
  const nav = useNavigate(),
    sentinel = useRef<HTMLDivElement>(null),
    loadingMoreRef = useRef(false),
    [items, setItems] = useState<Recommendation[]>([]),
    [selected, setSelected] = useState<Recommendation | null>(null),
    [qr, setQr] = useState<{url: string; qr: string} | null>(null),
    [source, setSource] = useState<'tmdb' | 'library'>('library'),
    [preferences, setPreferences] = useState<{
      selectedGenres: string[]
      inferredGenres: string[]
    }>({selectedGenres: [], inferredGenres: []}),
    [loading, setLoading] = useState(true),
    [loadingMore, setLoadingMore] = useState(false),
    [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(false),
    [error, setError] = useState('')
  const load = () => {
    if (!profile) return
    loadingMoreRef.current = false
    setLoading(true)
    setPage(1)
    setError('')
    Promise.all([api.profileRecommendations(profile.id, 1), api.recommendationPreferencesQr(profile.id)])
      .then(([result, code]) => {
        setItems(result.items)
        setSource(result.source)
        setPreferences(result.preferences)
        setQr(code)
        setHasMore(result.hasMore)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }
  const loadMore = async (focusFirstNew = false) => {
    if (!profile || !hasMore || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const nextPage = page + 1
    const previousCount = items.length
    try {
      const result = await api.profileRecommendations(profile.id, nextPage)
      const shouldFocusNext = focusFirstNew || document.activeElement?.id === 'recommendations-load-more'
      setItems((current) => {
        const known = new Set(current.map((item) => item.id))
        return [...current, ...result.items.filter((item) => !known.has(item.id))]
      })
      setPage(nextPage)
      setHasMore(result.hasMore)
      if (shouldFocusNext) requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-recommendation-index="${previousCount}"]`)?.focus()))
    } catch (e: any) {
      setError(e.message)
      setHasMore(false)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }
  useEffect(() => {
    load()
    if (!profile) return
    const events = new EventSource(`/api/recommendations/preferences/events?profileId=${profile.id}`)
    events.onmessage = load
    return () => events.close()
  }, [profile?.id])
  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      {rootMargin: '500px'},
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, page, profile?.id])
  if (!profile)
    return (
      <section className="recommendations-empty">
        <Sparkles />
        <h1>Choisissez d’abord un profil</h1>
        <p>Les recommandations sont personnelles et tiennent compte de la limite d’âge du profil actif.</p>
        <button data-focus className="primary" onClick={() => nav('/profiles')}>
          <UserRound /> Choisir un profil
        </button>
      </section>
    )
  return (
    <section className="recommendations-page">
      <header className="recommendations-heading">
        <div>
          <span className="eyebrow">POUR {profile.name.toUpperCase()}</span>
          <h1>Vos recommandations</h1>
          <p>Une sélection construite à partir de vos évaluations et de vos genres préférés.</p>
          <div className="taste-summary">
            {preferences.inferredGenres.slice(0, 4).map((genre) => (
              <span key={`inferred-${genre}`}>
                <Star /> {genre}
              </span>
            ))}
            {preferences.selectedGenres.slice(0, 4).map((genre) => (
              <span className="manual" key={`manual-${genre}`}>
                <Plus /> {genre}
              </span>
            ))}
          </div>
        </div>
        <aside className="recommendation-qr">
          <div>
            <QrCode />
            <b>Affiner mes goûts</b>
            <small>Scannez pour choisir vos genres sur mobile</small>
          </div>
          {qr ? <img src={qr.qr} alt="QR code des préférences de recommandation" /> : <LoaderCircle className="spin" />}
        </aside>
      </header>
      {source === 'library' && (
        <div className="recommendation-notice">
          <Info /> Ajoutez une clé TMDB dans les paramètres pour recevoir aussi des recommandations de titres qui ne sont pas encore dans votre bibliothèque.
        </div>
      )}
      {error && <Notice text={error} />}
      <div className="recommendation-grid">
        {loading ? (
          <LoaderCircle className="spin recommendations-loader" />
        ) : (
          items.map((item, index) => (
            <button data-focus data-recommendation-index={index} autoFocus={index === 0} className="recommendation-card" key={item.id} onFocus={() => {if (index >= items.length - 8) void loadMore()}} onClick={() => setSelected(item)}>
              <div className="recommendation-poster" style={mediaArt(item.poster || item.backdrop)}>
                <span className={item.available ? 'available' : 'to-find'}>{item.available ? 'DISPONIBLE' : 'À TROUVER'}</span>
              </div>
              <div>
                <small>
                  {item.kind === 'movie' ? 'FILM' : 'SÉRIE'} · {item.year || '—'}
                </small>
                <h2>{item.title}</h2>
                <p>{item.reason}</p>
              </div>
            </button>
          ))
        )}
        {!loading && !items.length && !error && <EmptyState icon={<Sparkles />} title="Pas encore assez d’indices" text="Notez quelques films ou séries, choisissez vos genres favoris via le QR code et relancez la sélection." />}
      </div>
      <div ref={sentinel} className="recommendation-sentinel" aria-live="polite">
        {!loading && items.length > 0 && !hasMore && <span>Vous avez parcouru toutes les recommandations.</span>}
        {!loading && hasMore && <button id="recommendations-load-more" data-focus aria-busy={loadingMore} onFocus={() => void loadMore(true)} onClick={() => void loadMore(true)}>{loadingMore?<LoaderCircle className="spin"/>:<ChevronDown/>}{loadingMore?'Chargement…':'Charger la suite'}</button>}
      </div>
      {source === 'tmdb' && <p className="tmdb-credit">Ce produit utilise l’API TMDB mais n’est ni approuvé ni certifié par TMDB.</p>}
      {selected && <RecommendationDetails item={selected} profileId={profile.id} onClose={() => setSelected(null)} />}
    </section>
  )
}

function RecommendationDetails({item}: {item: Recommendation; profileId?: number; onClose: () => void}) {
  const nav = useNavigate()
  useEffect(() => {
    nav(recommendationDetailPath(item))
  }, [item, nav])
  return null
}

function RecommendationPreferencesPage() {
  const profileId = Number(new URLSearchParams(location.search).get('profileId')),
    [data, setData] = useState<ProfilePreferences | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle'),
    [error, setError] = useState('')
  useEffect(() => {
    if (Number.isInteger(profileId) && profileId > 0)
      api
        .profilePreferences(profileId)
        .then((result) => {
          setData(result)
          setSelected(result.selectedGenres)
        })
        .catch((e) => setError(e.message))
    else setError('Lien de profil invalide.')
  }, [profileId])
  const toggle = (genre: string) => {
    setStatus('idle')
    setSelected((items) => (items.includes(genre) ? items.filter((item) => item !== genre) : [...items, genre]))
  }
  const save = async () => {
    setStatus('saving')
    setError('')
    try {
      const result = await api.saveProfilePreferences(profileId, selected)
      setData(result)
      setSelected(result.selectedGenres)
      setStatus('saved')
    } catch (e: any) {
      setError(e.message)
      setStatus('error')
    }
  }
  return (
    <main className="preference-page">
      <Logo compact />
      <section>
        {error && !data ? (
          <Notice text={error} />
        ) : !data ? (
          <LoaderCircle className="spin" />
        ) : (
          <>
            <span className="eyebrow">RECOMMANDATIONS DE {data.profile.name.toUpperCase()}</span>
            <h1>Quels styles aimez-vous ?</h1>
            <p>Ces choix complètent automatiquement les goûts déjà compris grâce aux notes données après vos séances.</p>
            <div className="inferred-tastes">
              <b>Déduits de vos évaluations</b>
              {data.inferredGenres.length ? (
                <div>
                  {data.inferredGenres.map((genre) => (
                    <span key={genre}>
                      <Star /> {genre}
                    </span>
                  ))}
                </div>
              ) : (
                <small>Notez quelques médias pour que MoodFlix apprenne vos goûts.</small>
              )}
            </div>
            <div className="genre-picker">
              <b>Ajoutez vos préférences</b>
              <div>
                {data.allGenres.map((genre) => (
                  <button type="button" className={selected.includes(genre) ? 'selected' : ''} onClick={() => toggle(genre)} key={genre}>
                    {selected.includes(genre) && <Check />}
                    {genre}
                  </button>
                ))}
              </div>
            </div>
            <button className="primary save-preferences" disabled={status === 'saving'} onClick={save}>
              {status === 'saving' ? <LoaderCircle className="spin" /> : <Check />}
              {status === 'saved' ? ' Préférences enregistrées' : ' Enregistrer mes goûts'}
            </button>
            {error && <Notice text={error} />}
          </>
        )}
      </section>
    </main>
  )
}

function LocalMediaCard({item, id, className = 'media-card', style, children, onActivate, onLongPress}: {item: Media; id?: string; className?: string; style?: ReturnType<typeof mediaArt>; children: any; onActivate?: () => void; onLongPress: (item: Media) => void}) {
  const nav = useNavigate(),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    longTriggered = useRef(false)
  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }
  const start = () => {
    longTriggered.current = false
    clear()
    timer.current = setTimeout(() => {
      timer.current = null
      longTriggered.current = true
      onLongPress(item)
    }, 800)
  }
  const activate = () => (onActivate ? onActivate() : nav(localDetailPath(item)))
  useEffect(() => clear, [])
  return (
    <button
      id={id}
      data-focus
      className={className}
      style={style}
      onPointerDown={start}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(event) => {
        event.preventDefault()
        clear()
        longTriggered.current = true
        onLongPress(item)
      }}
      onClick={(event) => {
        if (longTriggered.current) {
          event.preventDefault()
          longTriggered.current = false
          return
        }
        activate()
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !timer.current) {
          event.preventDefault()
          event.stopPropagation()
          start()
        }
      }}
      onKeyUp={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          clear()
          if (!longTriggered.current) activate()
          longTriggered.current = false
        }
      }}
    >
      {children}
    </button>
  )
}

type MediaAction = 'hide' | 'delete'
function MediaContextMenu({item, seriesTitle, season, initialAction, onClose, onSuccess}: {item: Media; seriesTitle?: string; season?: number; initialAction?: MediaAction; onClose: () => void; onSuccess?: () => void}) {
  const [confirmation, setConfirmation] = useState<MediaAction | null>(initialAction || null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const targetLabel = season !== undefined ? `la saison ${season}` : seriesTitle ? 'cette série' : item.kind === 'series' ? 'cet épisode' : 'ce film'
  const fileLabel = season !== undefined ? 'Les épisodes de cette saison' : seriesTitle ? 'Tous les épisodes' : 'Le fichier vidéo'
  const filesPlural = season !== undefined || Boolean(seriesTitle)
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('moodflix:close-overlay', close)
    return () => window.removeEventListener('moodflix:close-overlay', close)
  }, [onClose])
  const hide = async () => {
    setBusy(true)
    setError('')
    try {
      if (seriesTitle && season !== undefined) await api.setSeasonHidden(seriesTitle, season)
      else if (seriesTitle) await api.setSeriesHidden(seriesTitle)
      else await api.setMediaHidden(item.id)
      onClose()
      if (onSuccess) onSuccess()
      else location.reload()
    } catch (e: any) {
      setError(e.message)
      setBusy(false)
    }
  }
  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      if (seriesTitle && season !== undefined) await api.deleteSeasonFiles(seriesTitle, season)
      else if (seriesTitle) await api.deleteSeriesFiles(seriesTitle)
      else await api.deleteMediaFile(item.id)
      onClose()
      if (onSuccess) onSuccess()
      else location.reload()
    } catch (e: any) {
      setError(e.message)
      setBusy(false)
    }
  }
  return (
    <div className="tv-overlay media-context-overlay" data-tv-modal role="dialog" aria-modal="true" aria-label={`Actions pour ${item.title}`}>
      <article className="media-context-dialog">
        <button data-focus data-modal-close className="modal-close" onClick={onClose}>
          <X />
        </button>
        <span className="eyebrow">MÉDIA LOCAL</span>
        <h2>{item.title}</h2>
        {confirmation ? (
          <>
            <div className="delete-warning">
              {confirmation === 'delete' ? <Trash2 /> : <EyeOff />}
              <p>
                <b>{confirmation === 'delete' ? 'Supprimer définitivement' : 'Masquer de la médiathèque'} {targetLabel} ?</b>
                <small>{confirmation === 'delete' ? `${fileLabel} ${filesPlural ? 'seront effacés' : 'sera effacé'} du disque. Cette action est irréversible.` : `${fileLabel} ${filesPlural ? 'resteront' : 'restera'} sur le disque, mais ${targetLabel} ne sera plus visible dans MoodFlix.`}</small>
              </p>
            </div>
            <div className="media-context-actions">
              <button data-focus disabled={busy} onClick={() => initialAction ? onClose() : setConfirmation(null)}>
                <ArrowLeft /> Annuler
              </button>
              <button data-focus autoFocus disabled={busy} className={confirmation === 'delete' ? 'danger' : ''} onClick={confirmation === 'delete' ? remove : hide}>
                {busy ? <LoaderCircle className="spin" /> : confirmation === 'delete' ? <Trash2 /> : <EyeOff />} Confirmer
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Que souhaitez-vous faire de ce média ?</p>
            <div className="media-context-actions vertical">
              <button data-focus autoFocus disabled={busy} onClick={() => setConfirmation('hide')}>
                <EyeOff />{' '}
                <span>
                  <b>Masquer de la médiathèque</b>
                  <small>{seriesTitle ? 'Les épisodes restent intacts' : 'Le fichier reste intact'} sur le disque.</small>
                </span>
              </button>
              <button data-focus disabled={busy} className="danger" onClick={() => setConfirmation('delete')}>
                <Trash2 />{' '}
                <span>
                  <b>Supprimer définitivement</b>
                  <small>Efface {seriesTitle ? 'tous les épisodes' : 'le fichier vidéo'} du disque.</small>
                </span>
              </button>
            </div>
          </>
        )}
        {error && <Notice text={error} />}
      </article>
    </div>
  )
}

function MediaRow({title, icon, items}: {title: string; icon: any; items: Media[]; profileId?: number}) {
  const [context, setContext] = useState<Media | null>(null)
  return (
    <section className="media-row">
      <h2>
        {icon}
        {title}
      </h2>
      <div className="cards">
        {items.map((item) => (
          <LocalMediaCard key={item.id} item={item} onLongPress={setContext} style={mediaArt(item.poster)}>
            <WatchStatus item={item} />
            <div className="card-art">
              <span>{item.kind === 'series' ? 'SÉRIE' : 'FILM'}</span>
              <h3>{item.title}</h3>
              {item.position !== undefined && item.duration > 0 && (
                <div className="watch-progress">
                  <i
                    style={{
                      width: `${Math.min(100, (item.position / item.duration) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
            <div className="card-meta">
              <b>{item.title}</b>
              <small>
                {item.year} · {Math.round(item.duration / 60)} min · {item.age_rating}+
              </small>
            </div>
          </LocalMediaCard>
        ))}
      </div>
      {context && <MediaContextMenu item={context} onClose={() => setContext(null)} />}
    </section>
  )
}

function RecommendationRow({title, icon, items, onSelect, moreTo}: {title: string; icon: any; items: Recommendation[]; onSelect: (item: Recommendation) => void; moreTo?: string}) {
  const nav = useNavigate(),
    [context, setContext] = useState<Recommendation | null>(null)
  const asMedia = (item: Recommendation): Media => ({
    id: item.localMediaId!,
    title: item.title,
    kind: item.kind,
    series_title: item.kind === 'series' ? item.title : undefined,
    year: item.year,
    duration: 0,
    age_rating: item.age_rating,
    genres: item.genres,
    overview: item.overview,
    poster: item.poster,
    backdrop: item.backdrop,
  })
  return (
    <section className="media-row catalog-row">
      <h2>
        {icon}
        {title}
      </h2>
      <div className="cards">
        {items.map((item) =>
          item.available && item.localMediaId ? (
            <LocalMediaCard item={asMedia(item)} key={item.id} onActivate={() => onSelect(item)} onLongPress={() => setContext(item)} style={mediaArt(item.poster)}>
              <div className="card-art">
                <span>{item.kind === 'series' ? 'SÉRIE' : 'FILM'}</span>
                <h3>{item.title}</h3>
              </div>
              <div className="card-meta">
                <b>{item.title}</b>
                <small>
                  {item.year || '—'} · {item.available ? 'Dans votre médiathèque' : 'À découvrir'}
                </small>
              </div>
            </LocalMediaCard>
          ) : (
            <button data-focus key={item.id} className="media-card" onClick={() => onSelect(item)} style={mediaArt(item.poster)}>
              <div className="card-art">
                <span>{item.kind === 'series' ? 'SÉRIE' : 'FILM'}</span>
                <h3>{item.title}</h3>
              </div>
              <div className="card-meta">
                <b>{item.title}</b>
                <small>{item.year || '—'} · À découvrir</small>
              </div>
            </button>
          ),
        )}
        {moreTo && (
          <button data-focus className="media-card recommendation-more" onClick={() => nav(moreTo)}>
            <Sparkles />
            <b>Voir toutes les recommandations</b>
            <span>
              Ouvrir la sélection <ChevronRight />
            </span>
          </button>
        )}
      </div>
      {context && context.localMediaId && <MediaContextMenu item={asMedia(context)} seriesTitle={context.kind === 'series' ? context.title : undefined} onClose={() => setContext(null)} />}
    </section>
  )
}

function DiskScanner({onClose, onComplete}: {onClose: () => void; onComplete: () => void}) {
  const [drives, setDrives] = useState<DriveInfo[]>([]),
    [selected, setSelected] = useState(''),
    [job, setJob] = useState<DriveScan | null>(null),
    [detecting, setDetecting] = useState(true),
    [error, setError] = useState('')
  const refresh = () => {
    setDetecting(true)
    setError('')
    api
      .drives()
      .then((items) => {
        setDrives(items)
        setSelected((current) => (items.some((item) => item.device === current) ? current : items[0]?.device || ''))
      })
      .catch((e) => setError(e.message))
      .finally(() => setDetecting(false))
  }
  useEffect(refresh, [])
  useEffect(() => {
    if (!job?.id || job.status === 'complete' || job.status === 'error') return
    let active = true,
      timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const next = await api.driveScan(job.id)
        if (!active) return
        setJob(next)
        if (next.status !== 'complete' && next.status !== 'error') timer = setTimeout(poll, 650)
      } catch (e: any) {
        if (active) setError(e.message)
      }
    }
    timer = setTimeout(poll, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [job?.id, job?.status])
  const start = async () => {
    if (!selected) return
    setError('')
    try {
      setJob(await api.startDriveScan(selected))
    } catch (e: any) {
      setError(e.message)
    }
  }
  const running = job && job.status !== 'complete' && job.status !== 'error',
    phase = job?.phase === 'mounting' ? 'Montage du disque…' : job?.phase === 'discovering' ? `${job.found} fichier${job.found > 1 ? 's' : ''} vidéo détecté${job.found > 1 ? 's' : ''}…` : job?.phase === 'scanning' ? `Analyse et récupération des informations · ${job.current}/${job.total}` : 'Analyse terminée'
  return (
    <div className="tv-overlay disk-scanner-overlay" data-tv-modal role="dialog" aria-modal="true" aria-label="Analyser un disque USB">
      <article className="disk-scanner">
        <button data-focus data-modal-close autoFocus className="modal-close" onClick={onClose}>
          <X />
        </button>
        <header>
          <HardDrive />
          <div>
            <span className="eyebrow">IMPORTATION USB</span>
            <h2>{job ? 'Analyse de la médiathèque' : 'Choisissez un disque à analyser'}</h2>
            <p>{job ? 'Les médias sont ajoutés au fur et à mesure avec leurs informations et leurs affiches.' : 'MoodFlix détecte les partitions USB connectées au Raspberry Pi.'}</p>
          </div>
        </header>
        {!job ? (
          <>
            <div className="drive-list">
              {detecting ? (
                <div className="drive-detecting">
                  <LoaderCircle className="spin" /> Recherche des disques USB…
                </div>
              ) : (
                drives.map((drive) => (
                  <button data-focus key={drive.id} className={selected === drive.device ? 'selected' : ''} onClick={() => setSelected(drive.device)}>
                    <span>
                      <HardDrive />
                    </span>
                    <div>
                      <b>{drive.name}</b>
                      <small>
                        {formatBytes(drive.size)} · {drive.fileSystem.toUpperCase()} · {drive.mounted ? drive.mountpoint : 'Sera monté automatiquement'}
                      </small>
                    </div>
                    {selected === drive.device && <Check />}
                  </button>
                ))
              )}
              {!detecting && !drives.length && !error && <EmptyState icon={<HardDrive />} title="Aucun disque USB détecté" text="Branchez le disque, attendez quelques secondes puis relancez la détection." />}
            </div>
            {error && <Notice text={error} />}
            <footer>
              <button data-focus onClick={refresh}>
                <RefreshCw /> Détecter à nouveau
              </button>
              <button data-focus className="primary" disabled={!selected} onClick={start}>
                <Search /> Analyser ce disque
              </button>
            </footer>
          </>
        ) : (
          <>
            <section className="scan-progress-panel">
              <div className="scan-status">
                <span className={`scan-state ${job.status}`}>{job.status === 'complete' ? <Check /> : job.status === 'error' ? <Info /> : <LoaderCircle className="spin" />}</span>
                <div>
                  <b>{phase}</b>
                  <small>
                    {job.enriched} média{job.enriched > 1 ? 's' : ''} enrichi
                    {job.enriched > 1 ? 's' : ''} avec les services configurés
                  </small>
                </div>
                <strong>{job.phase === 'discovering' ? '…' : `${job.percent}%`}</strong>
              </div>
              <div className={`scan-progress ${job.phase === 'discovering' ? 'indeterminate' : ''}`}>
                <i
                  style={{
                    width: `${job.phase === 'discovering' ? 18 : job.percent}%`,
                  }}
                />
              </div>
              <div className="scan-counts">
                <span>
                  <b>{job.found}</b> vidéos trouvées
                </span>
                <span>
                  <b>{job.current}</b> intégrées
                </span>
                <span>
                  <b>{job.enriched}</b> enrichies
                </span>
              </div>
            </section>
            {job.recent.length > 0 && (
              <section className="scan-recent">
                <span className="eyebrow">DERNIERS MÉDIAS INTÉGRÉS</span>
                <div>
                  {job.recent.map((item, index) => (
                    <div key={`${item.title}-${index}`} style={mediaArt(item.poster)}>
                      <span>{item.kind === 'movie' ? <Film /> : <Tv />}</span>
                      <b>{item.title}</b>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {job.error && <Notice text={job.error} />}
            <footer>
              {running ? (
                <button data-focus onClick={onClose}>
                  Continuer en arrière-plan
                </button>
              ) : job.status === 'complete' ? (
                <button data-focus className="primary" onClick={onComplete}>
                  <Check /> Voir la médiathèque
                </button>
              ) : (
                <button data-focus onClick={() => setJob(null)}>
                  <ArrowLeft /> Choisir un autre disque
                </button>
              )}
            </footer>
          </>
        )}
      </article>
    </div>
  )
}

function Library({kind, profile}: {kind: 'movie'; profile: Profile | null}) {
  const {items, loading} = useMedia(kind, profile?.id),
    [trending, setTrending] = useState<Recommendation[]>([]),
    [selected, setSelected] = useState<Recommendation | null>(null),
    [scanner, setScanner] = useState(false)
  useEffect(() => {
    if (!loading && !items.length) api.trending(kind, profile?.id).then(setTrending)
  }, [loading, items.length, kind, profile?.id])
  return (
    <section className="library-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">{items.length ? 'VOTRE BIBLIOTHÈQUE' : 'TENDANCES TMDB'}</span>
          <h1>Films</h1>
          <p>{items.length ? `${items.length} films disponibles sur cet appareil` : 'Aucun fichier local : découvrez les titres populaires du moment'}</p>
        </div>
        <button data-focus onClick={() => setScanner(true)}>
          <HardDrive /> Actualiser les disques
        </button>
      </div>
      {loading ? <LoaderCircle className="spin" /> : items.length ? <MediaRow title="Tous les films" icon={<Film />} items={items} profileId={profile?.id} /> : <RecommendationRow title="Films tendance" icon={<Film />} items={trending} onSelect={setSelected} />} {!loading && !items.length && !trending.length && <EmptyState icon={<Sparkles />} title="Aucun contenu à afficher" text="Ajoutez une clé TMDB dans les paramètres pour afficher les tendances, ou branchez un disque contenant vos médias." />}
      {selected && <RecommendationDetails item={selected} profileId={profile?.id} onClose={() => setSelected(null)} />} {scanner && <DiskScanner onClose={() => setScanner(false)} onComplete={() => location.reload()} />}
    </section>
  )
}

function LocalSeriesCard({series, autoFocus, onLongPress}: {series: SeriesGroup; autoFocus: boolean; onLongPress: (series: SeriesGroup) => void}) {
  const nav = useNavigate(),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    longTriggered = useRef(false)
  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }
  const start = () => {
    longTriggered.current = false
    clear()
    timer.current = setTimeout(() => {
      timer.current = null
      longTriggered.current = true
      onLongPress(series)
    }, 800)
  }
  const activate = () => nav(`/details/series?title=${encodeURIComponent(series.title)}`)
  useEffect(() => clear, [])
  return (
    <button
      data-focus
      autoFocus={autoFocus}
      className="series-card"
      onPointerDown={start}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(event) => {
        event.preventDefault()
        clear()
        longTriggered.current = true
        onLongPress(series)
      }}
      onClick={(event) => {
        if (longTriggered.current) {
          event.preventDefault()
          longTriggered.current = false
          return
        }
        activate()
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !timer.current) {
          event.preventDefault()
          event.stopPropagation()
          start()
        }
      }}
      onKeyUp={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          clear()
          if (!longTriggered.current) activate()
          longTriggered.current = false
        }
      }}
    >
      <span className="series-poster" style={mediaArt(series.poster || series.backdrop)}>
        <b>
          {series.seasons.length} saison{series.seasons.length > 1 ? 's' : ''}
        </b>
      </span>
      <span className="series-card-copy">
        <strong>{series.title}</strong>
        <small>
          {series.episodes.length} épisode
          {series.episodes.length > 1 ? 's' : ''} · {series.year || '—'}
        </small>
      </span>
    </button>
  )
}

function SeriesLibrary({profile}: {profile: Profile | null}) {
  const [groups, setGroups] = useState<SeriesGroup[]>([]),
    [trending, setTrending] = useState<Recommendation[]>([]),
    [trendDetails, setTrendDetails] = useState<Recommendation | null>(null),
    [context, setContext] = useState<SeriesGroup | null>(null),
    [loading, setLoading] = useState(true),
    [scanner, setScanner] = useState(false)
  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .series(profile?.id)
      .then((items) => {
        if (!active) return
        setGroups(items)
        if (!items.length) api.trending('series', profile?.id).then((next) => active && setTrending(next))
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [profile?.id])
  return (
    <section className="library-page series-library">
      <div className="page-title">
        <div>
          <span className="eyebrow">{groups.length ? 'VOTRE BIBLIOTHÈQUE' : 'TENDANCES TMDB'}</span>
          <h1>Séries</h1>
          <p>{groups.length ? `${groups.length} série${groups.length > 1 ? 's' : ''} classée${groups.length > 1 ? 's' : ''} par saisons et épisodes` : 'Aucun épisode local : découvrez les séries populaires du moment'}</p>
        </div>
        <button data-focus onClick={() => setScanner(true)}>
          <HardDrive /> Actualiser les disques
        </button>
      </div>
      {loading ? (
        <LoaderCircle className="spin" />
      ) : groups.length ? (
        <div className="series-grid">
          {groups.map((series, index) => (
            <LocalSeriesCard series={series} autoFocus={index === 0} onLongPress={setContext} key={series.id} />
          ))}
        </div>
      ) : (
        <RecommendationRow title="Séries tendance" icon={<Tv />} items={trending} onSelect={setTrendDetails} />
      )}{' '}
      {!loading && !groups.length && !trending.length && <EmptyState icon={<Sparkles />} title="Aucune série à afficher" text="Branchez un disque contenant des épisodes ou ajoutez une clé TMDB dans les paramètres." />}
      {trendDetails && <RecommendationDetails item={trendDetails} profileId={profile?.id} onClose={() => setTrendDetails(null)} />} {scanner && <DiskScanner onClose={() => setScanner(false)} onComplete={() => location.reload()} />}
      {context && context.episodes[0] && <MediaContextMenu item={context.episodes[0]} seriesTitle={context.title} onClose={() => setContext(null)} />}
    </section>
  )
}

function SeriesDetails({series, onClose}: {series: SeriesGroup; onClose: () => void}) {
  const nav = useNavigate(),
    [season, setSeason] = useState(series.seasons[0] || 1)
  useEffect(() => setSeason(series.seasons[0] || 1), [series.id])
  const episodes = series.episodes.filter((item) => (item.season || 1) === season).sort((a, b) => (a.episode || 0) - (b.episode || 0))
  const search = () => nav(`/torrents?q=${encodeURIComponent(series.title)}&kind=series`)
  return (
    <div className="tv-overlay series-detail-overlay" data-tv-modal role="dialog" aria-modal="true" aria-label={`Détails de ${series.title}`}>
      <article className="series-detail">
        <header style={mediaArt(series.backdrop || series.poster)}>
          <div className="series-detail-shade" />
          <button data-focus data-focus-down="#series-detail-search" data-modal-close autoFocus className="modal-close" onClick={onClose}>
            <X />
          </button>
          <div>
            <span className="eyebrow">SÉRIE · {series.year || 'ANNÉE INCONNUE'}</span>
            <h2>{series.title}</h2>
            <div className="detail-genres">
              {series.genres.map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
            <p>{series.overview || 'Aucun résumé disponible pour le moment.'}</p>
            <button id="series-detail-search" data-focus className="primary series-search" onClick={search}>
              <Search /> Rechercher un torrent
            </button>
          </div>
        </header>
        <section className="episode-browser">
          <div className="episode-heading">
            <div>
              <span className="eyebrow">ÉPISODES</span>
              <h3>Saison {season}</h3>
            </div>
            <label>
              Saison
              <select data-focus value={season} onChange={(event) => setSeason(Number(event.target.value))}>
                {series.seasons.map((value) => (
                  <option value={value} key={value}>
                    Saison {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="episode-list">
            {episodes.map((episode, index) => (
              <button data-focus key={episode.id} className="episode-row" onClick={() => nav(`/watch/${episode.id}`)}>
                <span className="episode-number">{String(episode.episode || index + 1).padStart(2, '0')}</span>
                <span className="episode-copy">
                  <b>{episode.title}</b>
                  <small>
                    S{String(season).padStart(2, '0')} E{String(episode.episode || index + 1).padStart(2, '0')} · {Math.round(episode.duration / 60) || '—'} min
                  </small>
                </span>
                {isWatched(episode) && (
                  <span className="episode-watched">
                    <Check /> Vu
                  </span>
                )}
                <Play />
              </button>
            ))}
          </div>
        </section>
      </article>
    </div>
  )
}

function CatalogDetailPage({profile}: {profile: Profile | null}) {
  const nav = useNavigate(),
    {pathname} = useLocation(),
    catalogId = decodeURIComponent(pathname.split('/').pop() || '')
  const [item] = useState<Recommendation | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`moodflix-catalog-detail:${catalogId}`) || 'null')
    } catch {
      return null
    }
  })
  const [related, setRelated] = useState<Recommendation[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    if (!item) return
    let active = true
    setError('')
    api
      .related(item, profile?.id)
      .then((items) => active && setRelated(items))
      .catch((e) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [item, profile?.id])
  if (!item)
    return (
      <section className="local-detail-page">
        <Notice text="Cette fiche n’est plus disponible. Revenez à la liste et sélectionnez de nouveau ce média." />
      </section>
    )
  return (
    <section className="local-detail-page">
      <header className="local-detail-hero" style={mediaArt(item.backdrop || item.poster)}>
        <div className="local-detail-shade" />
        <div className="local-detail-content">
          <button data-focus className="local-detail-back" onClick={() => nav(-1)}>
            <ArrowLeft /> Retour
          </button>
          <span className="eyebrow">
            {item.kind === 'movie' ? 'FILM' : 'SÉRIE'} · {item.year || 'ANNÉE INCONNUE'}
          </span>
          <h1>{item.title}</h1>
          <div className="detail-genres">
            {item.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
          <p>{item.overview || 'Aucun résumé disponible pour le moment.'}</p>
          <strong className="detail-reason">
            <Sparkles /> {item.reason}
          </strong>
          <div className="local-detail-actions">
            <button data-focus className="primary" onClick={() => nav(`/torrents?q=${encodeURIComponent(item.title)}&kind=${item.kind}`)}>
              <Search /> Rechercher un torrent
            </button>
          </div>
        </div>
      </header>
      <div className="local-detail-body">
        {item.kind === 'series' && (
          <section className="catalog-episodes-placeholder">
            <Tv />
            <div>
              <span className="eyebrow">ÉPISODES</span>
              <h2>Ajoutez cette série à votre médiathèque</h2>
              <p>Après téléchargement et analyse du disque, ses saisons et ses épisodes apparaîtront ici dans l’ordre.</p>
            </div>
          </section>
        )}
        {error && <Notice text={error} />} {related.length > 0 && <RecommendationRow title="Vous aimerez aussi" icon={<Sparkles />} items={related} onSelect={(suggestion) => nav(recommendationDetailPath(suggestion))} />}
      </div>
    </section>
  )
}

function MediaDetailPage({profile}: {profile: Profile | null}) {
  const nav = useNavigate(),
    {pathname} = useLocation(),
    id = pathname.split('/').pop()!
  const [item, setItem] = useState<Media | null>(null),
    [related, setRelated] = useState<Recommendation[]>([]),
    [selected, setSelected] = useState<Recommendation | null>(null),
    [action, setAction] = useState<MediaAction | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setError('')
    api
      .mediaById(id)
      .then((media) => {
        if (!active) return
        setItem(media)
        return api.related(mediaRecommendation(media), profile?.id)
      })
      .then((items) => {
        if (active && items) setRelated(items)
      })
      .catch((e) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [id, profile?.id])
  if (error)
    return (
      <section className="local-detail-page">
        <Notice text={error} />
      </section>
    )
  if (!item)
    return (
      <section className="local-detail-page detail-loading">
        <LoaderCircle className="spin" />
      </section>
    )
  return (
    <section className="local-detail-page">
      <header className="local-detail-hero" style={mediaArt(item.backdrop || item.poster)}>
        <div className="local-detail-shade" />
        <div className="local-detail-content">
          <button data-focus className="local-detail-back" onClick={() => nav(-1)}>
            <ArrowLeft /> Retour
          </button>
          <span className="eyebrow">FILM · {item.year || 'ANNÉE INCONNUE'}</span>
          <h1>{item.title}</h1>
          <div className="detail-genres">
            {item.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
          <p>{item.overview || 'Aucun résumé disponible pour le moment.'}</p>
          <div className="local-detail-actions">
            <button data-focus className="primary" onClick={() => nav(`/watch/${item.id}`)}>
              <Play /> Regarder
            </button>
            <button data-focus onClick={() => setAction('hide')}>
              <EyeOff /> Masquer
            </button>
            <button data-focus className="danger" onClick={() => setAction('delete')}>
              <Trash2 /> Supprimer
            </button>
          </div>
        </div>
      </header>
      <div className="local-detail-body">{related.length > 0 && <RecommendationRow title="Vous aimerez aussi" icon={<Sparkles />} items={related} onSelect={setSelected} />}</div>
      {selected && <RecommendationDetails item={selected} profileId={profile?.id} onClose={() => setSelected(null)} />}
      {action && <MediaContextMenu item={item} initialAction={action} onClose={() => setAction(null)} onSuccess={() => nav('/movies', {replace: true})} />}
    </section>
  )
}

function SeriesDetailPage({profile}: {profile: Profile | null}) {
  const nav = useNavigate(),
    location = useLocation(),
    title = new URLSearchParams(location.search).get('title') || ''
  const [series, setSeries] = useState<SeriesGroup | null>(null),
    [season, setSeason] = useState(1),
    [related, setRelated] = useState<Recommendation[]>([]),
    [selected, setSelected] = useState<Recommendation | null>(null),
    [context, setContext] = useState<Media | null>(null),
    [managedAction, setManagedAction] = useState<{item: Media; action: MediaAction; season?: number} | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setError('')
    api
      .series(profile?.id)
      .then((groups) => {
        if (!active) return
        const found = groups.find(
          (item) =>
            item.title.localeCompare(title, undefined, {
              sensitivity: 'base',
            }) === 0,
        )
        if (!found) throw new Error('Cette série est introuvable dans la médiathèque.')
        setSeries(found)
        setSeason(found.seasons[0] || 1)
        const recommendation: Recommendation = {
          id: `local-series:${found.id}`,
          title: found.title,
          kind: 'series',
          year: found.year,
          genres: found.genres,
          overview: found.overview,
          poster: found.poster,
          backdrop: found.backdrop,
          age_rating: found.age_rating,
          score: 0,
          reason: 'Disponible dans votre bibliothèque MoodFlix',
          available: true,
          source: 'library',
        }
        return api.related(recommendation, profile?.id)
      })
      .then((items) => {
        if (active && items) setRelated(items)
      })
      .catch((e) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [title, profile?.id])
  if (error)
    return (
      <section className="local-detail-page">
        <Notice text={error} />
      </section>
    )
  if (!series)
    return (
      <section className="local-detail-page detail-loading">
        <LoaderCircle className="spin" />
      </section>
    )
  const episodes = series.episodes.filter((item) => (item.season || 1) === season).sort((a, b) => (a.episode || 0) - (b.episode || 0))
  return (
    <section className="local-detail-page">
      <header className="local-detail-hero" style={mediaArt(series.backdrop || series.poster)}>
        <div className="local-detail-shade" />
        <div className="local-detail-content">
          <button data-focus className="local-detail-back" onClick={() => nav(-1)}>
            <ArrowLeft /> Retour
          </button>
          <span className="eyebrow">SÉRIE · {series.year || 'ANNÉE INCONNUE'}</span>
          <h1>{series.title}</h1>
          <div className="detail-genres">
            {series.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
          <p>{series.overview || 'Aucun résumé disponible pour le moment.'}</p>
          <div className="local-detail-actions">
            <button id="play-season" data-focus data-focus-down="#episode-first" className="primary" onClick={() => episodes[0] && nav(`/watch/${episodes[0].id}`)}>
              <Play /> Lire la saison
            </button>
          </div>
        </div>
      </header>
      <div className="local-detail-body">
        <section className="episode-browser">
          <div className="episode-heading">
            <div>
              <span className="eyebrow">ÉPISODES</span>
              <h3>Saison {season}</h3>
            </div>
            <div className="season-management"><label>Saison<select data-focus value={season} onChange={(event) => setSeason(Number(event.target.value))}>{series.seasons.map((value) => <option value={value} key={value}>Saison {value}</option>)}</select></label><div><button data-focus onClick={() => episodes[0] && setManagedAction({item: episodes[0], action: 'hide', season})}><EyeOff/> Masquer la saison</button><button data-focus className="danger" onClick={() => episodes[0] && setManagedAction({item: episodes[0], action: 'delete', season})}><Trash2/> Supprimer la saison</button></div></div>
          </div>
          <div className="episode-list">
            {episodes.map((episode, index) => (
              <div className="episode-management-row" key={episode.id}><LocalMediaCard item={episode} id={index === 0 ? 'episode-first' : undefined} className="episode-row" onActivate={() => nav(`/watch/${episode.id}`)} onLongPress={setContext}>
                <span className="episode-number">{String(episode.episode || index + 1).padStart(2, '0')}</span>
                <span className="episode-copy">
                  <b>{episode.title}</b>
                  <small>
                    S{String(season).padStart(2, '0')} E{String(episode.episode || index + 1).padStart(2, '0')} · {Math.round(episode.duration / 60) || '—'} min
                  </small>
                </span>
                <WatchStatus item={episode} episode />
                <Play />
              </LocalMediaCard><div className="episode-file-actions"><button data-focus aria-label={`Masquer ${episode.title}`} title="Masquer l’épisode" onClick={() => setManagedAction({item: episode, action: 'hide'})}><EyeOff/></button><button data-focus className="danger" aria-label={`Supprimer ${episode.title}`} title="Supprimer l’épisode" onClick={() => setManagedAction({item: episode, action: 'delete'})}><Trash2/></button></div></div>
            ))}
          </div>
        </section>
        {related.length > 0 && <RecommendationRow title="Vous aimerez aussi" icon={<Sparkles />} items={related} onSelect={setSelected} />}
      </div>
      {selected && <RecommendationDetails item={selected} profileId={profile?.id} onClose={() => setSelected(null)} />} {context && <MediaContextMenu item={context} onClose={() => setContext(null)} onSuccess={() => nav('/series', {replace: true})} />}
      {managedAction && <MediaContextMenu item={managedAction.item} seriesTitle={managedAction.season !== undefined ? series.title : undefined} season={managedAction.season} initialAction={managedAction.action} onClose={() => setManagedAction(null)} onSuccess={() => nav('/series', {replace: true})} />}
    </section>
  )
}

function RecommendModal() {
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [selected, setSelected] = useState<number[]>([]),
    [duration, setDuration] = useState(120),
    [kind, setKind] = useState('all'),
    [results, setResults] = useState<Media[]>([])
  useEffect(() => {
    api.profiles().then((p) => {
      setProfiles(p)
      setSelected(p.slice(0, 2).map((x) => x.id))
    })
  }, [])
  const run = () => api.recommend({participants: selected, maxDuration: duration, kind}).then((r) => setResults(r.items))
  return (
    <div
      id="recommend-modal"
      className="modal-wrap"
      data-tv-modal
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.currentTarget === e.target) e.currentTarget.classList.remove('open')
      }}
    >
      <div className="modal">
        <button data-focus data-modal-close className="modal-close" onClick={() => document.getElementById('recommend-modal')?.classList.remove('open')}>
          <X />
        </button>
        <span className="eyebrow">SÉLECTION INTELLIGENTE</span>
        <h2>On regarde quoi ce soir ?</h2>
        <label>Participants</label>
        <div className="choice-row">
          {profiles.map((p) => (
            <button data-focus className={selected.includes(p.id) ? 'selected' : ''} onClick={() => setSelected((v) => (v.includes(p.id) ? v.filter((x) => x !== p.id) : [...v, p.id]))} key={p.id}>
              {avatarIcon(p.avatar)} {p.name}
              {selected.includes(p.id) && <Check />}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label>
            Durée maximale
            <select data-focus value={duration} onChange={(e) => setDuration(+e.target.value)}>
              <option value="45">45 min</option>
              <option value="90">1 h 30</option>
              <option value="120">2 h</option>
              <option value="180">3 h</option>
            </select>
          </label>
          <label>
            Type
            <select data-focus value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">Tout</option>
              <option value="movie">Film</option>
              <option value="series">Série</option>
            </select>
          </label>
        </div>
        <button data-focus className="primary wide" onClick={run}>
          <Sparkles /> Trouver notre programme
        </button>
        {results.length > 0 && (
          <div className="suggestion">
            <b>Notre choix : {results[0].title}</b>
            <span>
              {results[0].year} · {results[0].genres.join(' / ')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function Player({profile}: {profile: Profile | null}) {
  const nav = useNavigate(),
    {pathname} = useLocation(),
    id = pathname.split('/').pop()!
  const [item, setItem] = useState<Media | null>(null),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(1),
    [playbackStart, setPlaybackStart] = useState(0),
    [showUi, setShowUi] = useState(true),
    [nextIn, setNextIn] = useState<number | null>(null),
    [showRating, setShowRating] = useState(false),
    [score, setScore] = useState(0),
    [muted, setMuted] = useState(false),
    [neighbors, setNeighbors] = useState<{
      previous: EpisodeLink | null
      next: EpisodeLink | null
    }>({previous: null, next: null})
  const video = useRef<HTMLVideoElement>(null),
    playbackStartRef = useRef(0),
    lastSaved = useRef(0),
    openedSaved = useRef(false)
  useEffect(() => {
    let active = true
    openedSaved.current = false
    lastSaved.current = 0
    playbackStartRef.current = 0
    setPlaybackStart(0)
    setItem(null)
    setTime(0)
    setDuration(1)
    setNextIn(null)
    setShowRating(false)
    setNeighbors({previous: null, next: null})
    void (async () => {
      const [next, progress] = await Promise.all([api.mediaById(id), profile ? api.progress(profile.id, +id) : Promise.resolve({position: 0, completed: false})])
      if (!active) return
      const resume = progress.completed ? 0 : Math.min(progress.position, Math.max(0, next.duration - 1))
      playbackStartRef.current = resume
      setPlaybackStart(resume)
      setTime(resume)
      setDuration(next.duration > 0 ? next.duration : 1)
      setItem(next)
      if (next.kind === 'series') api.episodeNeighbors(id).then((value) => active && setNeighbors(value))
    })().catch(() => {})
    return () => {
      active = false
    }
  }, [id, profile])
  useEffect(() => {
    document.documentElement.classList.add('moodflix-player-active')
    document.documentElement.style.setProperty('cursor', 'none', 'important')
    document.body.style.setProperty('cursor', 'none', 'important')
    return () => {
      document.documentElement.classList.remove('moodflix-player-active')
      document.documentElement.style.removeProperty('cursor')
      document.body.style.removeProperty('cursor')
    }
  }, [])
  useEffect(() => {
    if (!showUi) return
    const t = setTimeout(() => setShowUi(false), 5000)
    return () => clearTimeout(t)
  }, [showUi])
  useEffect(() => {
    const reveal = () => setShowUi(true)
    window.addEventListener('keydown', reveal)
    window.addEventListener('pointerdown', reveal)
    return () => {
      window.removeEventListener('keydown', reveal)
      window.removeEventListener('pointerdown', reveal)
    }
  }, [])
  const toggle = () => {
    const v = video.current
    if (!v) return
    if (v.paused) v.play()
    else v.pause()
  }
  const toggleMute = () => {
    const v = video.current
    if (!v) return
    v.muted = !v.muted
    if (!v.muted && v.volume === 0) v.volume = 1
    setMuted(v.muted)
  }
  const goEpisode = (episode: EpisodeLink | null) => {
    if (episode) nav(`/watch/${episode.id}`, {replace: true})
  }
  const exitPlayer = () => nav(item?.kind === 'series' ? `/details/series?title=${encodeURIComponent(item.series_title || item.title)}` : item ? `/details/media/${item.id}` : '/home', {replace: true})
  useEffect(() => {
    const handler = () => toggle()
    window.addEventListener('moodflix:playpause', handler)
    return () => window.removeEventListener('moodflix:playpause', handler)
  }, [])
  useEffect(() => {
    const handler = () => exitPlayer()
    window.addEventListener('moodflix:exit-player', handler)
    return () => window.removeEventListener('moodflix:exit-player', handler)
  }, [item])
  useEffect(
    () => () => {
      const current = playbackStartRef.current + (video.current?.currentTime || 0)
      if (profile && item && current > 0)
        void api.saveProgress({
          profileId: profile.id,
          mediaId: item.id,
          position: current,
          completed: false,
        })
    },
    [profile, item],
  )
  const format = (v: number) => new Date(Math.max(0, Number.isFinite(v) ? v : 0) * 1000).toISOString().slice(v >= 3600 ? 11 : 14, 19)
  const loaded = (v: HTMLVideoElement) => {
    v.defaultMuted = false
    v.muted = false
    if (v.volume === 0) v.volume = 1
    setMuted(false)
    const measured = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0
    setDuration(item?.duration || measured || duration)
    void v.play().catch(() => setPlaying(false))
  }
  const updateTime = (v: HTMLVideoElement) => {
    const current = playbackStart + (Number.isFinite(v.currentTime) ? v.currentTime : 0)
    setTime(current)
    const total = duration > 1 ? duration : item?.duration || 0,
      remaining = total - current
    if (item?.kind === 'series' && neighbors.next && remaining > 0 && remaining <= 10) setNextIn(Math.max(1, Math.ceil(remaining)))
    else setNextIn(null)
    if (profile && item && current > 0 && (!openedSaved.current || current - lastSaved.current >= 15)) {
      openedSaved.current = true
      lastSaved.current = current
      api.saveProgress({
        profileId: profile.id,
        mediaId: item.id,
        position: current,
        completed: false,
      })
    }
  }
  const seekTo = (position: number) => {
    const next = Math.max(0, Math.min(Math.max(0, duration - 1), position))
    playbackStartRef.current = next
    setPlaybackStart(next)
    setTime(next)
    setNextIn(null)
    setShowUi(true)
  }
  const ended = () => {
    setPlaying(false)
    if (profile && item)
      api.saveProgress({
        profileId: profile.id,
        mediaId: item.id,
        position: duration,
        completed: true,
      })
    if (item?.kind === 'series' && neighbors.next) goEpisode(neighbors.next)
    else setShowRating(true)
  }
  const submitRating = () => {
    if (profile && item && score) api.rate(profile.id, item.id, score).then(() => nav('/home'))
    else nav('/home')
  }
  const progress = Math.min(100, Math.max(0, (time / Math.max(1, duration)) * 100))
  return createPortal(
    <main className="player" onPointerMove={() => setShowUi(true)} style={mediaArt(item?.backdrop || item?.poster || 'gradient:interstellar')}>
      {item?.path && <video key={`${id}:${playbackStart}`} ref={video} src={`/api/media/${id}/stream?start=${Math.floor(playbackStart)}`} playsInline autoPlay onLoadedMetadata={(e) => loaded(e.currentTarget)} onVolumeChange={(e) => setMuted(e.currentTarget.muted || e.currentTarget.volume === 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(e) => updateTime(e.currentTarget)} onEnded={ended} />}
      <div className={`player-shade ${showUi ? 'show' : ''}`}>
        <header>
          <button data-focus onClick={exitPlayer} aria-label="Retour à la fiche">
            <ArrowLeft />
          </button>
          <h1>{item?.title || 'Chargement…'}</h1>
          <div className="player-header-actions">
            {neighbors.previous && (
              <button data-focus onClick={() => goEpisode(neighbors.previous)} aria-label="Épisode précédent" title="Épisode précédent">
                <SkipBack />
              </button>
            )}
            {neighbors.next && (
              <button data-focus onClick={() => goEpisode(neighbors.next)} aria-label="Épisode suivant" title="Épisode suivant">
                <SkipForward />
              </button>
            )}
            <button data-focus aria-label="Sous-titres">
              <Captions />
            </button>
            <button data-focus aria-label="Langue audio">
              <Languages />
            </button>
          </div>
        </header>
        <section className="player-center">
          <button data-focus onClick={toggle}>
            {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
          </button>
          {!item?.path && <p>Mode aperçu — ajoutez le fichier à votre bibliothèque pour démarrer la lecture.</p>}
        </section>
        <footer>
          <button data-focus data-focus-right="#player-timeline" onClick={toggle}>
            {playing ? <Pause /> : <Play />}
          </button>
          <span>{format(time)}</span>
          <input
            id="player-timeline"
            data-focus
            aria-label="Position de lecture"
            type="range"
            step="10"
            min="0"
            max={Math.max(1, duration)}
            value={Math.min(time, Math.max(1, duration))}
            style={{'--player-progress': `${progress}%`} as any}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault()
                seekTo(time + (event.key === 'ArrowRight' ? 10 : -10))
              }
            }}
            onChange={(e) => seekTo(+e.target.value)}
          />
          <span>{format(duration)}</span>
          <button data-focus>
            <Subtitles />
          </button>
          <button data-focus onClick={toggleMute} aria-label={muted ? 'Activer le son' : 'Couper le son'}>
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button data-focus>
            <ListVideo />
          </button>
        </footer>
      </div>
      {nextIn !== null && neighbors.next && (
        <button data-focus className="next-episode" onClick={() => goEpisode(neighbors.next)}>
          Épisode suivant <b>{nextIn}</b>
        </button>
      )}
      {showRating && (
        <div className="rating-overlay" data-tv-modal role="dialog" aria-modal="true">
          <div className="rating-dialog">
            <span className="eyebrow">LECTURE TERMINÉE</span>
            <h2>
              Qu’avez-vous pensé de
              <br />
              {item?.title} ?
            </h2>
            <div className="stars">
              {[1, 2, 3, 4, 5].map((value) => (
                <button data-focus key={value} aria-label={`${value} étoile${value > 1 ? 's' : ''}`} onClick={() => setScore(value)}>
                  <Star fill={value <= score ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <button data-focus className="primary" disabled={!score} onClick={submitRating}>
              Valider ma note
            </button>
            <button data-focus data-modal-close className="rate-later" onClick={() => nav('/home')}>
              Plus tard
            </button>
          </div>
        </div>
      )}
    </main>,
    document.body,
  )
}

function formatBytes(bytes: number) {
  if (!bytes) return '—'
  const u = ['o', 'Ko', 'Mo', 'Go', 'To']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(i > 2 ? 1 : 0)} ${u[i]}`
}
type TorrentKind = 'all' | 'movie' | 'series'

function VirtualKeyboard({value, onChange, onSubmit, onQr, onClose}: {value: string; onChange: (value: string) => void; onSubmit: () => void; onQr: () => void; onClose: () => void}) {
  const rows = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN']
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('moodflix:close-overlay', close)
    requestAnimationFrame(() => (document.querySelector('.virtual-keyboard .keyboard-row [data-focus]') as HTMLElement)?.focus())
    return () => window.removeEventListener('moodflix:close-overlay', close)
  }, [])
  return (
    <div className="tv-overlay" data-tv-modal role="dialog" aria-modal="true" aria-label="Clavier de recherche">
      <div className="virtual-keyboard">
        <header>
          <div>
            <Keyboard />
            <span>
              <small>RECHERCHE TORRENT</small>
              <b>{value || 'Saisissez un titre'}</b>
            </span>
          </div>
          <button data-focus data-modal-close onClick={onClose} aria-label="Fermer">
            <X />
          </button>
        </header>
        <div className="keyboard-keys">
          {rows.map((row, index) => (
            <div className="keyboard-row" key={row}>
              {[...row].map((letter, letterIndex) => (
                <button data-focus autoFocus={index === 0 && letterIndex === 0} key={letter} onClick={() => onChange(value + letter)}>
                  {letter}
                </button>
              ))}
            </div>
          ))}
          <div className="keyboard-row actions">
            <button data-focus onClick={() => onChange(value.slice(0, -1))}>
              ⌫ Effacer
            </button>
            <button data-focus className="space" onClick={() => onChange(value + ' ')}>
              Espace
            </button>
            <button data-focus onClick={() => onChange('')}>
              Vider
            </button>
          </div>
        </div>
        <footer>
          <button id="keyboard-phone-search" data-focus data-focus-right="#keyboard-submit-search" onClick={onQr}>
            <QrCode /> Saisir sur le téléphone
          </button>
          <button id="keyboard-submit-search" data-focus data-focus-left="#keyboard-phone-search" className="primary" disabled={!value.trim()} onClick={onSubmit}>
            <Search /> Rechercher
          </button>
        </footer>
      </div>
    </div>
  )
}

function SearchQrOverlay({onClose}: {onClose: () => void}) {
  const [qr, setQr] = useState<{url: string; qr: string} | null>(null)
  useEffect(() => {
    api.torrentSearchQr().then(setQr)
    const close = () => onClose()
    window.addEventListener('moodflix:close-overlay', close)
    return () => window.removeEventListener('moodflix:close-overlay', close)
  }, [])
  return (
    <div className="tv-overlay" data-tv-modal role="dialog" aria-modal="true" aria-label="Recherche depuis un téléphone">
      <div className="search-qr-dialog">
        <button data-focus data-modal-close autoFocus className="modal-close" onClick={onClose}>
          <X />
        </button>
        <QrCode />
        <span className="eyebrow">RECHERCHE MOBILE</span>
        <h2>Scannez avec votre téléphone</h2>
        <p>Saisissez le titre sur la page qui s’ouvre. La recherche démarrera automatiquement sur la télévision.</p>
        {qr ? (
          <>
            <img src={qr.qr} alt="QR code de recherche torrent" />
            <small>{qr.url}</small>
          </>
        ) : (
          <LoaderCircle className="spin" />
        )}
      </div>
    </div>
  )
}

function TorrentRemoteSearch() {
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState<TorrentKind>('all'),
    [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle'),
    [error, setError] = useState('')
  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setStatus('sending')
    setError('')
    try {
      await api.sendTorrentSearch(query.trim(), kind)
      setStatus('sent')
    } catch (err: any) {
      setError(err.message)
      setStatus('error')
    }
  }
  return (
    <main className="remote-search-page">
      <Logo />
      <section>
        <span className="eyebrow">TÉLÉCOMMANDE MOODFLIX</span>
        <h1>Rechercher sur la TV</h1>
        <p>La recherche apparaîtra instantanément sur l’écran MoodFlix connecté au même réseau.</p>
        <form onSubmit={send}>
          <label>
            Titre
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setStatus('idle')
              }}
              placeholder="Film, série…"
            />
          </label>
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value as TorrentKind)}>
              <option value="all">Tout</option>
              <option value="movie">Film</option>
              <option value="series">Série</option>
            </select>
          </label>
          <button className="primary" disabled={!query.trim() || status === 'sending'}>
            <Send /> {status === 'sending' ? 'Envoi…' : 'Rechercher sur la TV'}
          </button>
        </form>
        {status === 'sent' && (
          <div className="remote-success">
            <Check /> Recherche envoyée à MoodFlix.
          </div>
        )}
        {status === 'error' && <Notice text={error} />}
      </section>
    </main>
  )
}

function Torrents() {
  const route = useLocation(),
    params = useMemo(() => new URLSearchParams(route.search), [route.search]),
    initialQuery = params.get('q') || '',
    rawKind = params.get('kind'),
    initialKind: TorrentKind = rawKind === 'movie' || rawKind === 'series' ? rawKind : 'all',
    initialSearchDone = useRef(false)
  const [tab, setTab] = useState<'search' | 'active' | 'done'>('search'),
    [query, setQuery] = useState(initialQuery),
    [kind, setKind] = useState<TorrentKind>(initialKind),
    [results, setResults] = useState<TorrentResult[]>([]),
    [page, setPage] = useState(1),
    [jobs, setJobs] = useState<any[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [keyboard, setKeyboard] = useState(false),
    [qrOpen, setQrOpen] = useState(false),
    [notice, setNotice] = useState<{
      type: 'success' | 'error'
      text: string
    } | null>(null),
    [added, setAdded] = useState<Set<string>>(new Set())
  const resultsRef = useRef<HTMLDivElement>(null),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageSize = 20,
    totalPages = Math.max(1, Math.ceil(results.length / pageSize)),
    visibleResults = results.slice((page - 1) * pageSize, page * pageSize)
  const search = async (nextQuery = query, nextKind = kind) => {
    if (!nextQuery.trim()) {
      setError('Saisissez un titre avant de lancer la recherche.')
      return
    }
    setLoading(true)
    setError('')
    setPage(1)
    try {
      setResults(await api.torrentSearch(nextQuery.trim(), nextKind))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (initialQuery && !initialSearchDone.current) {
      initialSearchDone.current = true
      search(initialQuery, initialKind)
    }
  }, [initialQuery, initialKind])
  useEffect(() => {
    if (tab === 'search') return
    let current = true,
      timer: ReturnType<typeof setInterval>
    const refresh = () =>
      api
        .torrents()
        .then((items) => {
          if (current) setJobs(items)
        })
        .catch((e) => {
          if (current) setError(e.message)
        })
    setError('')
    refresh()
    timer = setInterval(refresh, 2000)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [tab])
  useEffect(() => {
    if (tab === 'search') setError('')
  }, [tab])
  useEffect(() => {
    if (tab !== 'search' || loading || !results.length) return
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({block: 'start'})
      resultsRef.current?.querySelector<HTMLElement>('.torrent-result button')?.focus()
    })
  }, [tab, loading, results, page])
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    },
    [],
  )
  useEffect(() => {
    const remote = new EventSource('/api/torrents/search/events')
    remote.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as {
          query: string
          kind: TorrentKind
        }
        setTab('search')
        setQuery(next.query)
        setKind(next.kind)
        setPage(1)
        setLoading(true)
        setError('')
        api
          .torrentSearch(next.query, next.kind)
          .then(setResults)
          .catch((e) => setError(e.message))
          .finally(() => setLoading(false))
      } catch {
        setError('La recherche reçue depuis le téléphone est invalide.')
      }
    }
    return () => remote.close()
  }, [])
  const openQr = () => {
    setKeyboard(false)
    setQrOpen(true)
  }
  const add = async (result: TorrentResult) => {
    try {
      const response = await api.addTorrent(result.link)
      setAdded((current) => new Set(current).add(result.id))
      setJobs(await api.torrents())
      setNotice({
        type: 'success',
        text: response.duplicate ? `« ${result.title} » était déjà présent dans qBittorrent.` : `« ${result.title} » a été ajouté et confirmé par qBittorrent.`,
      })
    } catch (e: any) {
      setNotice({
        type: 'error',
        text: e.message || 'Impossible d’ajouter ce torrent.',
      })
    }
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 7000)
  }
  return (
    <section className="torrent-page">
      <aside>
        <button data-focus className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>
          <Search /> Rechercher
        </button>
        <button data-focus className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
          <Download /> Téléchargements
        </button>
        <button data-focus className={tab === 'done' ? 'active' : ''} onClick={() => setTab('done')}>
          <HardDrive /> Terminés & partage
        </button>
        <div className="torrent-tip">
          <b>Téléchargement intelligent</b>
          <p>
            <Check /> Priorité aux sources fiables
          </p>
          <p>
            <Check /> Ajout automatique à la bibliothèque
          </p>
        </div>
      </aside>
      <div className="torrent-main">
        {tab === 'search' ? (
          <>
            <span className="eyebrow">MOTEURS CONFIGURÉS</span>
            <h1>Rechercher un contenu</h1>
            <div className="searchbar">
              <Search />
              <input id="torrent-search-input" data-focus readOnly aria-haspopup="dialog" value={query} onClick={() => setKeyboard(true)} placeholder="Titre du contenu…" />
              <button data-focus className="qr-search-button" onClick={openQr} aria-label="Rechercher depuis un téléphone">
                <QrCode />
              </button>
              <button data-focus className="primary" onClick={() => search()}>
                Rechercher
              </button>
            </div>
            <div className="filters">
              {(
                [
                  ['all', 'Tous'],
                  ['movie', 'Films'],
                  ['series', 'Séries'],
                ] as const
              ).map(([k, l]) => (
                <button data-focus className={kind === k ? 'selected' : ''} onClick={() => setKind(k)} key={k}>
                  {l}
                </button>
              ))}
            </div>
            {error && <Notice text={error} />}
            <div ref={resultsRef} className="torrent-results">
              {loading ? (
                <LoaderCircle className="spin" />
              ) : (
                visibleResults.map((r) => (
                  <div className="torrent-result" key={r.id}>
                    <div>
                      <b>{r.title}</b>
                      <small>
                        {r.source} · {r.published ? new Date(r.published).toLocaleDateString('fr-FR') : ''}
                      </small>
                    </div>
                    <span className="seeds">↑ {r.seeds}</span>
                    <span>↓ {r.peers}</span>
                    <span>{formatBytes(r.size)}</span>
                    <button data-focus disabled={added.has(r.id)} onClick={() => add(r)}>
                      {added.has(r.id) ? <Check /> : <Download />} {added.has(r.id) ? 'Ajouté' : 'Télécharger'}
                    </button>
                  </div>
                ))
              )}
              {!loading && !results.length && !error && <EmptyState icon={<Search />} title="Lancez votre première recherche" text="Configurez un indexeur Torznab dans les paramètres, puis cherchez un contenu libre ou que vous êtes autorisé à télécharger." />}
            </div>
            {!loading && results.length > pageSize && (
              <nav className="torrent-pagination" aria-label="Pages des résultats">
                <button data-focus disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  <ChevronLeft /> Précédent
                </button>
                <span>
                  Page <b>{page}</b> sur {totalPages} · {results.length} résultats
                </span>
                <button data-focus disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                  Suivant <ChevronRight />
                </button>
              </nav>
            )}
          </>
        ) : (
          <TorrentJobs jobs={jobs.filter((j) => (tab === 'done' ? Number(j.progress) >= 0.999999 : Number(j.progress) < 0.999999))} done={tab === 'done'} />
        )}
      </div>
      {notice && (
        <div className={`torrent-toast ${notice.type}`} role="status" aria-live="polite">
          {notice.type === 'success' ? <Check /> : <Info />}
          <span>{notice.text}</span>
        </div>
      )}
      {keyboard && (
        <VirtualKeyboard
          value={query}
          onChange={setQuery}
          onClose={() => setKeyboard(false)}
          onQr={openQr}
          onSubmit={() => {
            setKeyboard(false)
            search()
          }}
        />
      )}
      {qrOpen && <SearchQrOverlay onClose={() => setQrOpen(false)} />}
    </section>
  )
}
function TorrentJobs({jobs, done}: {jobs: any[]; done: boolean}) {
  return (
    <>
      <span className="eyebrow">CLIENT QBITTORRENT</span>
      <h1>{done ? 'Terminés & en partage' : 'Téléchargements en cours'}</h1>
      {jobs.length ? (
        jobs.map((j) => (
          <div className="job" key={j.hash}>
            <div>
              <b>{j.name}</b>
              <small>
                {j.num_seeds} seed · {j.eta < 8640000 ? `${Math.ceil(j.eta / 60)} min` : '—'}
              </small>
            </div>
            <div className="job-progress">
              <i style={{width: `${j.progress * 100}%`}} />
            </div>
            <strong>{Math.round(j.progress * 100)} %</strong>
            <span>{done ? <Upload /> : <Download />}</span>
          </div>
        ))
      ) : (
        <EmptyState icon={done ? <Upload /> : <Download />} title={done ? 'Aucun torrent en partage' : 'Aucun téléchargement'} text="Les activités de qBittorrent apparaîtront ici automatiquement." />
      )}
    </>
  )
}
function EmptyState({icon, title, text}: {icon: any; title: string; text: string}) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}
function Notice({text}: {text: string}) {
  return (
    <div className="notice">
      <Info />
      {text}
    </div>
  )
}

function ProfileManager() {
  const blank = {name: '', avatar: 'pilot', color: '#f21d45', max_age: 18}
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [draft, setDraft] = useState(blank)
  const refresh = () => api.profiles().then(setProfiles)
  useEffect(() => {
    refresh()
  }, [])
  const change = (id: number, key: keyof Profile, value: string | number) => setProfiles((items) => items.map((p) => (p.id === id ? {...p, [key]: value} : p)))
  const changeAndSave = (profile: Profile, key: keyof Profile, value: string | number) => {
    const updated = {...profile, [key]: value}
    setProfiles((items) => items.map((p) => (p.id === profile.id ? updated : p)))
    api.updateProfile(profile.id, updated).catch((e) => alert(e.message))
  }
  const save = (p: Profile) => api.updateProfile(p.id, p).then(refresh)
  const remove = (id: number) =>
    api
      .deleteProfile(id)
      .then(refresh)
      .catch((e) => alert(e.message))
  const add = () => {
    if (!draft.name.trim()) return
    api.createProfile(draft).then(() => {
      setDraft(blank)
      refresh()
    })
  }
  return (
    <section className="profile-manager">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MEMBRES DU FOYER</span>
          <h2>Profils et limites d’âge</h2>
        </div>
        <small>Modifications enregistrées automatiquement.</small>
      </div>
      <div className="profile-editor-list">
        {profiles.map((p) => (
          <div className="profile-editor" key={p.id}>
            <span className="editor-avatar" style={{background: p.color}}>
              {avatarIcon(p.avatar)}
            </span>
            <label>
              Prénom
              <input maxLength={12} value={p.name} onChange={(e) => change(p.id, 'name', e.target.value)} onBlur={() => save(p)} />
            </label>
            <label>
              Avatar
              <select value={p.avatar} onChange={(e) => changeAndSave(p, 'avatar', e.target.value)}>
                <option value="pilot">Pilote</option>
                <option value="dreamer">Musique</option>
                <option value="arcade">Arcade</option>
                <option value="fox">Renard</option>
              </select>
            </label>
            <label>
              Âge maximum
              <select value={p.max_age} onChange={(e) => changeAndSave(p, 'max_age', +e.target.value)}>
                {[3, 7, 10, 12, 16, 18].map((age) => (
                  <option key={age} value={age}>
                    {age} ans
                  </option>
                ))}
              </select>
            </label>
            <input className="color-picker" aria-label="Couleur" type="color" value={p.color} onChange={(e) => changeAndSave(p, 'color', e.target.value)} />
            <button className="delete-profile" aria-label={`Supprimer ${p.name}`} onClick={() => remove(p.id)}>
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
      <div className="profile-editor new">
        <span className="editor-avatar" style={{background: draft.color}}>
          <UserPlus />
        </span>
        <label>
          Nouveau profil
          <input maxLength={12} placeholder="Prénom (12 caractères)" value={draft.name} onChange={(e) => setDraft({...draft, name: e.target.value})} />
        </label>
        <label>
          Avatar
          <select value={draft.avatar} onChange={(e) => setDraft({...draft, avatar: e.target.value})}>
            <option value="pilot">Pilote</option>
            <option value="dreamer">Musique</option>
            <option value="arcade">Arcade</option>
            <option value="fox">Renard</option>
          </select>
        </label>
        <label>
          Âge maximum
          <select value={draft.max_age} onChange={(e) => setDraft({...draft, max_age: +e.target.value})}>
            {[3, 7, 10, 12, 16, 18].map((age) => (
              <option key={age} value={age}>
                {age} ans
              </option>
            ))}
          </select>
        </label>
        <button className="primary add-profile" onClick={add}>
          <Plus /> Ajouter
        </button>
      </div>
    </section>
  )
}

function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [phase, setPhase] = useState<'idle' | 'checking' | 'ready' | 'confirm' | 'updating' | 'restarting' | 'error'>('idle')
  const [error, setError] = useState('')
  const check = async () => {
    setPhase('checking')
    setError('')
    try {
      setStatus(await api.checkUpdate())
      setPhase('ready')
    } catch (e: any) {
      setError(e.message)
      setPhase('error')
    }
  }
  const install = async () => {
    setPhase('updating')
    setError('')
    try {
      const result = await api.applyUpdate()
      if (!result.restarting) {
        setStatus(result.status)
        setPhase('ready')
        return
      }
      setPhase('restarting')
      setTimeout(() => location.reload(), 5000)
    } catch (e: any) {
      setError(e.message)
      setPhase('error')
    }
  }
  return (
    <section className="update-panel">
      <div className="update-icon">
        <RefreshCw className={phase === 'checking' || phase === 'updating' ? 'spin' : ''} />
      </div>
      <div className="update-copy">
        <span className="eyebrow">MISES À JOUR</span>
        <h2>MoodFlix depuis GitHub</h2>
        {phase === 'idle' && <p>Vérifiez si de nouveaux commits sont disponibles sur la branche principale.</p>}
        {phase === 'checking' && <p>Consultation du dépôt GitHub…</p>}
        {phase === 'updating' && <p>Téléchargement, installation des dépendances et reconstruction en cours… Ne coupez pas l’alimentation.</p>}
        {phase === 'restarting' && <p>Installation terminée. MoodFlix redémarre automatiquement…</p>}
        {phase === 'error' && <p className="update-error">{error}</p>}
        {phase === 'ready' && status && !status.available && (
          <p className="up-to-date">
            <ShieldCheck /> MoodFlix est à jour — commit {status.localCommit.slice(0, 7)}
          </p>
        )}
        {status?.available && (phase === 'ready' || phase === 'confirm') && (
          <div className="update-details">
            <p>
              <b>
                {status.commits.length} nouveau
                {status.commits.length > 1 ? 'x' : ''} commit
                {status.commits.length > 1 ? 's' : ''} disponible
                {status.commits.length > 1 ? 's' : ''}
              </b>
            </p>
            <div className="commit-list">
              {status.commits.map((commit) => (
                <div key={commit.hash}>
                  <GitCommitHorizontal />
                  <span>
                    <b>{commit.subject}</b>
                    <small>
                      {commit.shortHash} · {commit.author} · {new Date(commit.date).toLocaleDateString('fr-FR')}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {phase === 'confirm' && (
          <div className="update-confirm">
            <b>Confirmer la mise à jour ?</b>
            <span>La lecture doit être arrêtée. MoodFlix redémarrera à la fin de l’installation.</span>
          </div>
        )}
      </div>
      <div className="update-actions">
        {(phase === 'idle' || phase === 'ready' || phase === 'error') && (
          <button data-focus onClick={check}>
            <RefreshCw /> Vérifier
          </button>
        )}
        {phase === 'ready' && status?.available && (
          <button data-focus className="primary" onClick={() => setPhase('confirm')}>
            Installer
          </button>
        )}
        {phase === 'confirm' && (
          <>
            <button data-focus onClick={() => setPhase('ready')}>
              Annuler
            </button>
            <button data-focus className="primary" onClick={install}>
              <Check /> Confirmer
            </button>
          </>
        )}
      </div>
    </section>
  )
}

function SystemPanel() {
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'restarting' | 'error'>('idle'),
    [error, setError] = useState('')
  const restart = async () => {
    setPhase('restarting')
    setError('')
    try {
      await api.restartSystem()
    } catch (e: any) {
      setError(e.message)
      setPhase('error')
    }
  }
  return (
    <>
      <section className="system-panel">
        <div className="system-icon">
          <Power />
        </div>
        <div>
          <span className="eyebrow">ALIMENTATION</span>
          <h2>Raspberry Pi</h2>
          <p>Redémarrez proprement MoodFlix et le système. La télévision retrouvera automatiquement l’interface après le démarrage.</p>
          {phase === 'error' && <p className="update-error">{error}</p>}
        </div>
        <button data-focus className="restart-button" onClick={() => setPhase('confirm')}>
          <Power /> Redémarrer
        </button>
      </section>
      {phase === 'confirm' && (
        <div className="tv-overlay" data-tv-modal role="dialog" aria-modal="true" aria-label="Confirmer le redémarrage">
          <div className="restart-dialog">
            <button data-focus data-modal-close autoFocus className="modal-close" onClick={() => setPhase('idle')}>
              <X />
            </button>
            <Power />
            <span className="eyebrow">REDÉMARRAGE DU SYSTÈME</span>
            <h2>Redémarrer le Raspberry Pi ?</h2>
            <p>La lecture et les téléchargements seront interrompus pendant quelques instants.</p>
            <div>
              <button data-focus onClick={() => setPhase('idle')}>
                Annuler
              </button>
              <button data-focus className="primary" onClick={restart}>
                <Power /> Confirmer le redémarrage
              </button>
            </div>
          </div>
        </div>
      )}
      {phase === 'restarting' && (
        <div className="restart-screen" role="status">
          <LoaderCircle className="spin" />
          <h2>Redémarrage de MoodFlix…</h2>
          <p>L’interface reviendra automatiquement dans quelques instants.</p>
        </div>
      )}
    </>
  )
}

function SettingsScreen() {
  const onboarding = new URLSearchParams(location.search).get('onboarding') === '1'
  const [settings, setSettings] = useState<Record<string, string>>({}),
    [qr, setQr] = useState<{url: string; qr: string} | null>(null),
    [saved, setSaved] = useState(false),
    [finished, setFinished] = useState(false)
  const [torznabTest, setTorznabTest] = useState<TorznabTestResult | null>(null),
    [torznabError, setTorznabError] = useState(''),
    [testingTorznab, setTestingTorznab] = useState(false)
  const [omdbTest, setOmdbTest] = useState<OmdbTestResult | null>(null),
    [omdbError, setOmdbError] = useState(''),
    [testingOmdb, setTestingOmdb] = useState(false)
  const [qbitTest, setQbitTest] = useState<QbitTestResult | null>(null),
    [qbitError, setQbitError] = useState(''),
    [testingQbit, setTestingQbit] = useState(false)
  useEffect(() => {
    api.settings().then(setSettings)
    api.qr().then(setQr)
  }, [])
  const fields = [
    ['MEDIA_DIRS', 'Dossiers médias', '/srv/media,/media'],
    ['DOWNLOAD_DIR', 'Dossier de téléchargement', '/srv/media/downloads'],
    ['QBITTORRENT_URL', 'Adresse qBittorrent', 'http://127.0.0.1:8080'],
    ['QBITTORRENT_USER', 'Utilisateur qBittorrent', 'admin'],
    ['QBITTORRENT_PASSWORD', 'Mot de passe qBittorrent', '••••••••'],
    ['TORZNAB_URL', 'URL API Torznab complète', 'https://votre-indexeur.example/api?t=search'],
    ['TORZNAB_API_KEY', 'Clé API Torznab', ''],
    ['OMDB_API_KEY', 'Clé API OMDb', ''],
    ['TMDB_API_KEY', 'Clé API TMDB', ''],
    ['DOWNLOAD_LIMIT', 'Limite réception (Ko/s)', '0'],
    ['UPLOAD_LIMIT', 'Limite envoi (Ko/s)', '0'],
  ]
  const finish = () => api.completeOnboarding().then(() => setFinished(true))
  const testEngine = async () => {
    setTestingTorznab(true)
    setTorznabError('')
    setTorznabTest(null)
    try {
      setTorznabTest(await api.testTorznab(settings.TORZNAB_URL || '', settings.TORZNAB_API_KEY || ''))
    } catch (e: any) {
      setTorznabError(e.message)
    } finally {
      setTestingTorznab(false)
    }
  }
  const testOmdbKey = async () => {
    setTestingOmdb(true)
    setOmdbError('')
    setOmdbTest(null)
    try {
      setOmdbTest(await api.testOmdb(settings.OMDB_API_KEY || ''))
    } catch (e: any) {
      setOmdbError(e.message)
    } finally {
      setTestingOmdb(false)
    }
  }
  const testQbitConnection = async () => {
    setTestingQbit(true)
    setQbitError('')
    setQbitTest(null)
    try {
      setQbitTest(await api.testQbit(settings.QBITTORRENT_URL || '', settings.QBITTORRENT_USER || '', settings.QBITTORRENT_PASSWORD || ''))
    } catch (e: any) {
      setQbitError(e.message)
    } finally {
      setTestingQbit(false)
    }
  }
  return (
    <main className="settings-page">
      <header>
        <Logo compact />
        <div>
          <span className="eyebrow">{onboarding ? 'PREMIÈRE INSTALLATION' : 'ADMINISTRATION'}</span>
          <h1>{onboarding ? 'Bienvenue dans MoodFlix' : 'Réglages MoodFlix'}</h1>
        </div>
        {!onboarding && (
          <NavLink data-focus to="/home">
            <X />
          </NavLink>
        )}
      </header>
      {finished ? (
        <div className="setup-finished">
          <Check />
          <h1>Configuration terminée</h1>
          <p>Les profils sont prêts. Vous pouvez revenir sur votre téléviseur.</p>
        </div>
      ) : (
        <>
          <ProfileManager />
          <UpdatePanel />
          {!onboarding && <SystemPanel />}
          <div className="settings-layout">
            <aside>
              <div className="qr-card">
                <MonitorCog />
                <h2>Configurer depuis un autre appareil</h2>
                <p>Ce lien reste disponible pour vos prochaines modifications.</p>
                {qr && <img src={qr.qr} />}
                <small>{qr?.url}</small>
              </div>
            </aside>
            <section>
              <h2>Bibliothèque & services</h2>
              <div className="settings-grid">
                {fields.map(([key, label, placeholder]) => (
                  <label key={key}>
                    {label}
                    <input data-focus type={key.includes('PASSWORD') || key.includes('API_KEY') ? 'password' : 'text'} value={settings[key] || ''} placeholder={placeholder} onChange={(e) => setSettings((s) => ({...s, [key]: e.target.value}))} />
                  </label>
                ))}
              </div>
              <div className={`torznab-test ${qbitTest ? 'success' : qbitError ? 'failure' : ''}`}>
                <div>
                  <b>Connexion qBittorrent</b>
                  {qbitTest ? (
                    <span>
                      <Check /> qBittorrent {qbitTest.version} est connecté et prêt à recevoir des téléchargements.
                    </span>
                  ) : qbitError ? (
                    <span>
                      <Info /> {qbitError}
                    </span>
                  ) : (
                    <span>Vérifiez l’adresse et les identifiants WebUI enregistrés par l’installation.</span>
                  )}
                </div>
                <button data-focus onClick={testQbitConnection} disabled={testingQbit}>
                  {testingQbit ? <LoaderCircle className="spin" /> : <Download />} Tester
                </button>
              </div>
              <div className={`torznab-test ${torznabTest ? 'success' : torznabError ? 'failure' : ''}`}>
                <div>
                  <b>Connexion Torznab</b>
                  {torznabTest ? (
                    <span>
                      <Check /> {torznabTest.name} répond correctement ({torznabTest.categories} catégorie
                      {torznabTest.categories > 1 ? 's' : ''}).
                    </span>
                  ) : torznabError ? (
                    <span>
                      <Info /> {torznabError}
                    </span>
                  ) : (
                    <span>Vérifiez l’URL API et la clé avant d’enregistrer.</span>
                  )}
                </div>
                <button data-focus onClick={testEngine} disabled={testingTorznab}>
                  {testingTorznab ? <LoaderCircle className="spin" /> : <ShieldCheck />} Tester
                </button>
              </div>
              <div className={`torznab-test ${omdbTest ? 'success' : omdbError ? 'failure' : ''}`}>
                <div>
                  <b>Connexion OMDb</b>
                  {omdbTest ? (
                    <span>
                      <Check /> Clé valide — test réussi avec {omdbTest.title}
                      {omdbTest.poster ? ' et son affiche' : ''}.
                    </span>
                  ) : omdbError ? (
                    <span>
                      <Info /> {omdbError}
                    </span>
                  ) : (
                    <span>OMDb enrichit les nouveaux films et épisodes lors de l’analyse.</span>
                  )}
                </div>
                <button data-focus onClick={testOmdbKey} disabled={testingOmdb}>
                  {testingOmdb ? <LoaderCircle className="spin" /> : <ShieldCheck />} Tester
                </button>
              </div>
              <div className="settings-actions">
                <button data-focus onClick={() => api.scan().then((r) => alert(`${r.found} média(s) détecté(s), ${r.enriched || 0} enrichi(s) via OMDb`))}>
                  <HardDrive /> Analyser maintenant
                </button>
                <button
                  data-focus
                  className="primary"
                  onClick={() =>
                    api.saveSettings(settings).then(() => {
                      setSaved(true)
                      setTimeout(() => setSaved(false), 2000)
                    })
                  }
                >
                  {saved ? (
                    <>
                      <Check /> Enregistré
                    </>
                  ) : (
                    <>
                      <Settings /> Enregistrer
                    </>
                  )}
                </button>
              </div>
              <p className="legal">
                <Info /> MoodFlix ne fournit aucun contenu. Utilisez uniquement des sources et fichiers que vous avez le droit de télécharger et de consulter.
              </p>
            </section>
          </div>
          {onboarding && (
            <div className="finish-bar">
              <div>
                <b>Vos profils sont prêts ?</b>
                <span>La télévision continuera automatiquement.</span>
              </div>
              <button className="primary" onClick={finish}>
                <Check /> Terminer la configuration
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}

export default App
