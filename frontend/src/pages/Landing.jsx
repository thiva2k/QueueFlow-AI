import React from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  ShieldCheck,
  MonitorSmartphone,
  Ticket,
  Clock3,
  BellRing,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import SplitFlap from "../components/SplitFlap.jsx";
import { NumberTicker, AuroraMesh, Magnetic } from "../components/ui/index.js";
import { cn } from "../lib/utils.js";
import "../styles/landing.css";

/* Living board — advances a tick every `ms` so the split-flap cells flip on
   their own, turning the previews into a real, moving departure board.
   Frozen under prefers-reduced-motion. */
function useTicker(ms = 2800) {
  const reduce = useReducedMotion();
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (reduce) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [reduce, ms]);
  return tick;
}

const tokenAt = (base, tick) => `A-${String(base + tick).padStart(3, "0")}`;

/* Scroll-reveal wrapper — fades + rises into view once (whileInView). */
function Reveal({ children, className, delay = 0, y = 26, as: Comp = motion.div }) {
  const reduce = useReducedMotion();
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </Comp>
  );
}

/* Small faux status card used as a hero product preview — built from the REAL
   design system, so it reads as the actual product, not a mockup. */
function PreviewStatusCard() {
  return (
    <div className="lp-preview-card">
      <div className="lp-preview-card__top">
        <div>
          <p className="qf-eyebrow" style={{ margin: 0 }}>Your token</p>
          <div className="mt-2">
            <SplitFlap value="A-042" size="md" tone="live" label="Token A-042" />
          </div>
        </div>
        <span className="qf-chip qf-chip--live"><span className="qf-chip__dot" />Waiting</span>
      </div>
      <div className="lp-preview-card__rail" aria-hidden="true">
        <span className="lp-preview-card__rail-fill" />
        <span className="lp-preview-card__rail-you" />
      </div>
      <div className="lp-preview-card__rows">
        <div><span>Arrive by</span><strong className="mono">10:41 AM</strong></div>
        <div><span>People ahead</span><strong className="mono">6</strong></div>
        <div><span>Leave home in</span><strong className="mono lp-accent">18 min</strong></div>
      </div>
    </div>
  );
}

/* Faux board tile — the split-flap "now serving" moment. */
function PreviewBoardTile({ name, value, tone, service }) {
  return (
    <div className={cn("lp-board-tile", tone === "amber" && "lp-board-tile--called")}>
      <span className="lp-board-tile__name">{name}</span>
      <SplitFlap value={value} size="md" tone={tone} label={`${name} ${value}`} />
      {tone === "amber" ? (
        <span className="qf-chip qf-chip--amber"><span className="qf-chip__dot" />Now serving</span>
      ) : (
        <span className="lp-board-tile__idle">Ready</span>
      )}
      <span className="lp-board-tile__svc">{service}</span>
    </div>
  );
}

const FEATURES = [
  {
    icon: BrainCircuit,
    kicker: "01 · Predict",
    title: "It learns how long each service really takes.",
    body: "A service-time model trained on real counter patterns — time of day, queue load, service type — estimates your wait to the minute, not a printed guess.",
  },
  {
    icon: CalendarClock,
    kicker: "02 · Guide",
    title: "It tells you when to leave home.",
    body: "Instead of a paper number and a hard bench, you get a recommended arrival time. Walk in as your number is called — never before, never too late.",
  },
  {
    icon: ShieldCheck,
    kicker: "03 · Protect",
    title: "It flags a no-show before it happens.",
    body: "Every token carries a live no-show risk. Staff see who's likely to miss their turn and can nudge them — so counters never sit idle waiting on an empty chair.",
  },
];

const STEPS = [
  { n: "01", t: "Book in seconds", d: "Pick your service. No app to install, no account to create.", icon: Ticket },
  { n: "02", t: "Get your live estimate", d: "See your place in line and the minute you should arrive.", icon: Clock3 },
  { n: "03", t: "Arrive right on time", d: "We nudge you when it's time to leave. Walk straight to the counter.", icon: BellRing },
];

const STATS = [
  { value: 62, suffix: "%", label: "less time spent waiting in the hall" },
  { value: 3, suffix: "×", label: "fewer no-shows with risk-based nudges" },
  { value: 94, suffix: "%", label: "of citizens served within their window" },
];

export default function Landing({ onNavigate }) {
  const reduce = useReducedMotion();
  const heroRef = React.useRef(null);
  const [scrolled, setScrolled] = React.useState(false);
  const tick = useTicker(2800); // drives the self-flipping board previews

  // Apple-idiom container-scroll: the product panel tilts from back to flat as
  // the hero scrolls up (technique from aceternity "Container Scroll Animation").
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const rawRotate = useTransform(scrollYProgress, [0, 1], [16, 0]);
  const rawScale = useTransform(scrollYProgress, [0, 1], [0.92, 1.02]);
  const rawLift = useTransform(scrollYProgress, [0, 1], [0, -30]);
  const rotateX = useSpring(rawRotate, { stiffness: 120, damping: 26 });
  const scale = useSpring(rawScale, { stiffness: 120, damping: 26 });
  const lift = useSpring(rawLift, { stiffness: 120, damping: 26 });

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (path) => (event) => {
    event.preventDefault();
    // In-page anchors scroll smoothly; real routes hand off to the app router.
    if (path.startsWith("#")) {
      const el = document.querySelector(path);
      if (el) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      return;
    }
    onNavigate(path);
  };

  const tiltStyle = reduce ? {} : { rotateX, scale, y: lift, transformPerspective: 1200 };

  return (
    <div className="lp">
      {/* ---- floating nav ---- */}
      <header className={cn("lp-nav", scrolled && "is-scrolled")}>
        <div className="lp-nav__inner">
          <a href="/" onClick={go("/")} className="qf-brand">
            <span className="qf-brand__mark" aria-hidden="true">QF<span className="qf-brand__pulse" /></span>
            <span className="qf-brand__name">QueueFlow AI</span>
          </a>
          <nav className="lp-nav__links" aria-label="Sections">
            <a href="#how" onClick={go("#how")} className="lp-nav__link">How it works</a>
            <a href="#staff" onClick={go("#staff")} className="lp-nav__link">For staff</a>
            <a href="/display" onClick={go("/display")} className="lp-nav__link">Live board</a>
          </nav>
          <div className="lp-nav__cta">
            <a href="/track" onClick={go("/track")} className="qf-btn qf-btn--ghost lp-nav__ghost">Check status</a>
            <a href="/book" onClick={go("/book")} className="qf-btn qf-btn--primary">
              Book a token <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      {/* ---- hero ---- */}
      <section className="lp-hero" ref={heroRef}>
        <AuroraMesh className="lp-hero__flow" intensity="soft" />
        <div className="lp-hero__inner">
          <motion.p
            className="lp-hero__eyebrow"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <Sparkles size={14} aria-hidden="true" />
            QueueFlow AI · Predictive queue management
          </motion.p>

          <h1 className="lp-hero__title">
            {["Never wait", "in a queue", "again."].map((line, i) => (
              <motion.span
                key={line}
                className="lp-hero__line"
                initial={reduce ? false : { opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.09 }}
              >
                {i === 1 ? (
                  <>in a <span className="qf-gradient-text qf-anim-gradient">queue</span></>
                ) : (
                  line
                )}
              </motion.span>
            ))}
          </h1>

          <motion.p
            className="lp-hero__sub"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.42 }}
          >
            QueueFlow books your spot, predicts your real wait with AI, and tells you the exact
            minute to leave home — so you walk in just as your number is called.
          </motion.p>

          <motion.div
            className="lp-hero__cta"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.52 }}
          >
            <Magnetic>
              <a href="/book" onClick={go("/book")} className="qf-btn qf-btn--primary lp-cta-lg">
                Book a token <ArrowRight size={18} aria-hidden="true" />
              </a>
            </Magnetic>
            <Magnetic strength={10}>
              <a href="/display" onClick={go("/display")} className="qf-btn qf-btn--ghost lp-cta-lg">
                See the live board
              </a>
            </Magnetic>
          </motion.div>
        </div>

        {/* product preview — tilts flat on scroll */}
        <div className="lp-hero__stage">
          <motion.div className="lp-hero__panel" style={tiltStyle}>
            <div className="lp-hero__panel-glow" aria-hidden="true" />
            <div className="lp-hero__panel-body">
              <PreviewStatusCard />
              <div className="lp-hero__panel-board">
                <p className="lp-mini-label">Now serving</p>
                <div className="lp-hero__panel-board-grid">
                  <PreviewBoardTile name="Counter 1" value={tokenAt(39, tick)} tone="amber" service="NIC renewal" />
                  <PreviewBoardTile name="Counter 2" value={tokenAt(40, tick)} tone="amber" service="License" />
                  <PreviewBoardTile name="Counter 3" value="—" tone="muted" service="Open next" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <a href="#problem" onClick={go("#problem")} className="lp-hero__scroll" aria-label="Scroll to learn more">
          <ChevronDown size={22} aria-hidden="true" />
        </a>
      </section>

      {/* ---- problem ---- */}
      <section id="problem" className="lp-band lp-problem">
        <div className="lp-wrap">
          <Reveal as={motion.h2} className="lp-problem__line">
            A number on a paper slip tells you <span className="lp-muted-strike">nothing</span>.
          </Reveal>
          <Reveal as={motion.p} className="lp-problem__body" delay={0.08}>
            Not how long you'll wait. Not whether to sit or step out. So people arrive early and
            lose their morning to a hard bench — or arrive late and lose their turn. QueueFlow
            replaces the guesswork with a live, honest estimate.
          </Reveal>
        </div>
      </section>

      {/* ---- features (the three things) ---- */}
      <section className="lp-band lp-features">
        <div className="lp-wrap">
          <Reveal as={motion.p} className="qf-eyebrow lp-center">The moment you book</Reveal>
          <Reveal as={motion.h2} className="lp-h2 lp-center" delay={0.05}>
            Three things happen at once.
          </Reveal>
          <div className="lp-features__grid">
            {FEATURES.map((f, i) => (
              <Reveal key={f.kicker} className="lp-feature" delay={i * 0.08}>
                <span className="lp-feature__icon" aria-hidden="true"><f.icon size={22} /></span>
                <span className="lp-feature__kicker">{f.kicker}</span>
                <h3 className="lp-feature__title">{f.title}</h3>
                <p className="lp-feature__body">{f.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- signature: the live board ---- */}
      <section className="lp-band lp-board">
        <div className="lp-wrap">
          <Reveal as={motion.p} className="qf-eyebrow lp-center">The hall, live</Reveal>
          <Reveal as={motion.h2} className="lp-h2 lp-center" delay={0.05}>
            Watch every counter move in real time.
          </Reveal>
          <Reveal as={motion.p} className="lp-lead lp-center" delay={0.1}>
            A public departure board for your office — the same split-flap moment travellers trust
            at an airport, built for a government hall.
          </Reveal>
          <Reveal className="lp-board__stage" delay={0.14}>
            <div className="lp-board__panel">
              <div className="lp-board__panel-head">
                <span className="lp-mini-label">Service office queue</span>
                <span className="qf-chip qf-chip--ok"><span className="qf-chip__dot" />Open and serving</span>
              </div>
              <div className="lp-board__panel-grid">
                <PreviewBoardTile name="Counter 1" value={tokenAt(39, tick)} tone="amber" service="NIC renewal" />
                <PreviewBoardTile name="Counter 2" value={tokenAt(40, tick)} tone="amber" service="License renewal" />
                <PreviewBoardTile name="Counter 3" value={tokenAt(41, tick)} tone="amber" service="Document verify" />
                <PreviewBoardTile name="Counter 4" value="—" tone="muted" service="Open next" />
              </div>
            </div>
            <a href="/display" onClick={go("/display")} className="qf-btn qf-btn--secondary lp-board__cta">
              Open the full board <ArrowRight size={16} aria-hidden="true" />
            </a>
          </Reveal>
        </div>
      </section>

      {/* ---- how it works ---- */}
      <section id="how" className="lp-band lp-how">
        <div className="lp-wrap">
          <Reveal as={motion.p} className="qf-eyebrow lp-center">How it works</Reveal>
          <Reveal as={motion.h2} className="lp-h2 lp-center" delay={0.05}>Three steps. No app.</Reveal>
          <div className="lp-how__grid">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} className="lp-step" delay={i * 0.08}>
                <span className="lp-step__n mono">{s.n}</span>
                <span className="lp-step__icon" aria-hidden="true"><s.icon size={20} /></span>
                <h3 className="lp-step__title">{s.t}</h3>
                <p className="lp-step__body">{s.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- for staff ---- */}
      <section id="staff" className="lp-band lp-staff">
        <div className="lp-wrap lp-staff__grid">
          <div className="lp-staff__copy">
            <Reveal as={motion.p} className="qf-eyebrow">For staff</Reveal>
            <Reveal as={motion.h2} className="lp-h2" delay={0.05}>Give your counters a brain.</Reveal>
            <Reveal as={motion.p} className="lp-lead" delay={0.1}>
              One command console shows every counter, the live queue, on-time performance, and the
              AI's read on who's arriving next — with the reasoning shown, never a black box.
            </Reveal>
            <Reveal delay={0.16}>
              <ul className="lp-staff__list">
                <li><MonitorSmartphone size={18} aria-hidden="true" /> Call, serve and release tokens in one tap</li>
                <li><BrainCircuit size={18} aria-hidden="true" /> Explainable arrival predictions for the next citizen</li>
                <li><ShieldCheck size={18} aria-hidden="true" /> No-show risk and running-behind alerts, live</li>
              </ul>
            </Reveal>
            <Reveal delay={0.2}>
              <a href="/admin" onClick={go("/admin")} className="qf-btn qf-btn--primary lp-cta-lg">
                Open the console <ArrowRight size={18} aria-hidden="true" />
              </a>
            </Reveal>
          </div>
          <Reveal className="lp-staff__visual" delay={0.12} y={34}>
            <div className="lp-console">
              <div className="lp-console__kpis">
                {[["Waiting", "19", "live"], ["Now serving", "3", "amber"], ["On-time", "94%", "ok"]].map(([l, v, t]) => (
                  <div key={l} className={cn("lp-console__kpi", `lp-console__kpi--${t}`)}>
                    <span className="lp-console__kpi-label">{l}</span>
                    <span className="lp-console__kpi-value mono">{v}</span>
                  </div>
                ))}
              </div>
              <div className="lp-console__counter">
                <div className="lp-console__counter-head">
                  <span>Counter 3</span>
                  <span className="qf-chip qf-chip--amber qf-chip--sm"><span className="qf-chip__dot" />Called</span>
                </div>
                <SplitFlap value="A-041" size="sm" tone="amber" label="Counter 3 A-041" />
                <p className="lp-console__reason mono">// why this time — 3 ahead · ~10 min at this hour</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- proof ---- */}
      <section className="lp-band lp-proof">
        <div className="lp-wrap">
          <div className="lp-proof__grid">
            {STATS.map((s, i) => (
              <Reveal key={s.label} className="lp-proof__stat" delay={i * 0.08}>
                <span className="lp-proof__value">
                  <NumberTicker value={s.value} />{s.suffix}
                </span>
                <span className="lp-proof__label">{s.label}</span>
              </Reveal>
            ))}
          </div>
          <Reveal as={motion.p} className="lp-proof__note" delay={0.16}>
            Modelled on QueueFlow's prediction engine against typical divisional-secretariat load.
          </Reveal>
        </div>
      </section>

      {/* ---- final CTA ---- */}
      <section className="lp-band lp-final">
        <AuroraMesh className="lp-final__flow" intensity="bold" />
        <div className="lp-wrap lp-final__inner">
          <Reveal as={motion.h2} className="lp-final__title">
            Skip the <span className="qf-gradient-text qf-anim-gradient">waiting room</span>.
          </Reveal>
          <Reveal as={motion.p} className="lp-lead lp-center" delay={0.08}>
            Book your token now and see your live arrival time in seconds.
          </Reveal>
          <Reveal className="lp-final__cta" delay={0.14}>
            <Magnetic>
              <a href="/book" onClick={go("/book")} className="qf-btn qf-btn--primary lp-cta-lg">
                Book a token <ArrowRight size={18} aria-hidden="true" />
              </a>
            </Magnetic>
            <a href="/track" onClick={go("/track")} className="qf-btn qf-btn--ghost lp-cta-lg">
              I already have one
            </a>
          </Reveal>
        </div>
      </section>

      {/* ---- footer ---- */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__inner">
          <div className="lp-footer__brand">
            <a href="/" onClick={go("/")} className="qf-brand">
              <span className="qf-brand__mark" aria-hidden="true">QF</span>
              <span className="qf-brand__name">QueueFlow AI</span>
            </a>
            <p>Predictive queue management for public-service counters.</p>
          </div>
          <nav className="lp-footer__cols" aria-label="Footer">
            <div>
              <h4>Citizens</h4>
              <a href="/book" onClick={go("/book")}>Book a token</a>
              <a href="/track" onClick={go("/track")}>Check status</a>
            </div>
            <div>
              <h4>Staff</h4>
              <a href="/admin" onClick={go("/admin")}>Admin console</a>
              <a href="/analytics" onClick={go("/analytics")}>Analytics</a>
              <a href="/display" onClick={go("/display")}>Live board</a>
            </div>
          </nav>
        </div>
        <div className="lp-wrap lp-footer__base">
          <span>© 2026 QueueFlow AI</span>
          <span>Divisional Secretariat · Public Services Hall</span>
        </div>
      </footer>
    </div>
  );
}
