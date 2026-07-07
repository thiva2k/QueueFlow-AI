import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AnalyticsInsights from "./pages/AnalyticsInsights.jsx";
import CitizenBooking from "./pages/CitizenBooking.jsx";
import CitizenTokenStatus from "./pages/CitizenTokenStatus.jsx";
import PublicDisplay from "./pages/PublicDisplay.jsx";
import TokenLookup from "./pages/TokenLookup.jsx";
import Landing from "./pages/Landing.jsx";
import { api } from "./api.js";

function getRoute() {
  const path = window.location.pathname;
  if (path === "/" || path === "/home") return { name: "landing" };
  if (path === "/admin") return { name: "admin" };
  if (path === "/display") return { name: "display" };
  if (path === "/analytics") return { name: "analytics" };
  if (path === "/track" || path === "/status") return { name: "track" };
  if (path === "/book") return { name: "book" };
  const tokenMatch = path.match(/^\/token\/([^/]+)$/);
  if (tokenMatch) return { name: "token", tokenNumber: decodeURIComponent(tokenMatch[1]) };
  return { name: "landing" };
}

const CITIZEN_LINKS = [
  { path: "/book", label: "Book token", match: ["book"] },
  { path: "/track", label: "Check status", match: ["track", "token"] },
];

const STAFF_LINKS = [
  { path: "/admin", label: "Admin", match: ["admin"] },
  { path: "/display", label: "Display", match: ["display"] },
  { path: "/analytics", label: "Analytics", match: ["analytics"] },
];

function NavLink({ link, route, onNavigate }) {
  const reduce = useReducedMotion();
  const active = link.match.includes(route.name);
  return (
    <a
      href={link.path}
      className={active ? "qf-navlink is-active" : "qf-navlink"}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(link.path);
      }}
    >
      {active ? <motion.span layoutId="qf-nav-pill" className="qf-navlink__pill" transition={reduce ? { duration: 0 } : undefined} /> : null}
      <span className="qf-navlink__text">{link.label}</span>
    </a>
  );
}

function useBackendHealth() {
  const [online, setOnline] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        await api.health();
        if (!cancelled) setOnline(true);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    ping();
    const id = setInterval(ping, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return online;
}

function HealthDot() {
  const online = useBackendHealth();
  const state = online == null ? "unknown" : online ? "online" : "offline";
  const label = online == null ? "Checking…" : online ? "Online" : "Offline";
  return (
    <span className={`qf-health qf-health--${state}`} title={`Service ${label}`}>
      <span className="qf-health__dot" aria-hidden="true" />
      <span className="qf-health__label">{label}</span>
    </span>
  );
}

function AppNav({ route, onNavigate }) {
  return (
    <nav className="qf-nav" aria-label="Main navigation">
      <div className="qf-nav__inner">
        <a
          className="qf-brand"
          href="/book"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/book");
          }}
        >
          <span className="qf-brand__mark" aria-hidden="true">
            QF
            <span className="qf-brand__pulse" />
          </span>
          <span className="qf-brand__name">QueueFlow AI</span>
        </a>

        <div className="qf-nav__links">
          {CITIZEN_LINKS.map((link) => (
            <NavLink key={link.path} link={link} route={route} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="qf-nav__staff">
          <span className="qf-nav__staff-label">Staff</span>
          <div className="qf-nav__staff-links">
            {STAFF_LINKS.map((link) => (
              <NavLink key={link.path} link={link} route={route} onNavigate={onNavigate} />
            ))}
          </div>
          <HealthDot />
        </div>
      </div>
    </nav>
  );
}

function AppFooter() {
  return (
    <footer className="qf-footer">
      <span className="qf-footer__brand">QueueFlow AI — predictive queue management</span>
      <span className="qf-footer__office">Divisional Secretariat · Public Services Hall</span>
    </footer>
  );
}

export default function App() {
  const [route, setRoute] = React.useState(getRoute);

  const navigate = React.useCallback((path) => {
    window.history.pushState({}, "", path);
    setRoute(getRoute());
    window.scrollTo(0, 0);
  }, []);

  React.useEffect(() => {
    const onPopState = () => setRoute(getRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  let page = <Landing onNavigate={navigate} />;
  if (route.name === "book") page = <CitizenBooking onNavigate={navigate} />;
  if (route.name === "admin") page = <AdminDashboard />;
  if (route.name === "display") page = <PublicDisplay />;
  if (route.name === "analytics") page = <AnalyticsInsights />;
  if (route.name === "track") page = <TokenLookup onNavigate={navigate} />;
  if (route.name === "token") page = <CitizenTokenStatus tokenNumber={route.tokenNumber} />;

  // Landing + display own their full-page chrome (no standard nav/footer).
  const isImmersive = route.name === "display" || route.name === "landing";
  const routeKey = route.name + (route.tokenNumber ? `:${route.tokenNumber}` : "");
  const reduce = useReducedMotion();

  return (
    <>
      {!isImmersive ? <AppNav route={route} onNavigate={navigate} /> : null}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={routeKey}
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={reduce ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, transition: { duration: 0.16, ease: "easeIn" } }}
        >
          {page}
        </motion.div>
      </AnimatePresence>
      {!isImmersive ? <AppFooter /> : null}
    </>
  );
}
