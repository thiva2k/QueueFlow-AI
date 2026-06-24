import React from "react";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import CitizenBooking from "./pages/CitizenBooking.jsx";
import CitizenTokenStatus from "./pages/CitizenTokenStatus.jsx";
import PublicDisplay from "./pages/PublicDisplay.jsx";

function getRoute() {
  const path = window.location.pathname;
  if (path === "/admin") return { name: "admin" };
  if (path === "/display") return { name: "display" };
  if (path === "/book" || path === "/") return { name: "book" };
  const tokenMatch = path.match(/^\/token\/([^/]+)$/);
  if (tokenMatch) return { name: "token", tokenNumber: decodeURIComponent(tokenMatch[1]) };
  return { name: "book" };
}

function AppNav({ route, onNavigate }) {
  function handleClick(event, path) {
    event.preventDefault();
    onNavigate(path);
  }

  return (
    <nav className="app-nav" aria-label="Main navigation">
      <a className="brand-lockup" href="/book" onClick={(event) => handleClick(event, "/book")}>
        <span className="brand-mark">QF</span>
        <span>QueueFlow AI</span>
      </a>
      <div className="nav-links">
        <a href="/book" className={route.name === "book" ? "active" : ""} onClick={(event) => handleClick(event, "/book")}>
          Book Token
        </a>
        <a href="/admin" className={route.name === "admin" ? "active" : ""} onClick={(event) => handleClick(event, "/admin")}>
          Admin Dashboard
        </a>
        <a
          href="/display"
          className={route.name === "display" ? "active" : ""}
          onClick={(event) => handleClick(event, "/display")}
        >
          Public Display
        </a>
      </div>
    </nav>
  );
}

export default function App() {
  const [route, setRoute] = React.useState(getRoute);

  const navigate = React.useCallback((path) => {
    window.history.pushState({}, "", path);
    setRoute(getRoute());
  }, []);

  React.useEffect(() => {
    const onPopState = () => setRoute(getRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  let page = <CitizenBooking onNavigate={navigate} />;
  if (route.name === "admin") page = <AdminDashboard />;
  if (route.name === "display") page = <PublicDisplay />;
  if (route.name === "token") page = <CitizenTokenStatus tokenNumber={route.tokenNumber} />;

  return (
    <>
      <AppNav route={route} onNavigate={navigate} />
      {page}
    </>
  );
}
