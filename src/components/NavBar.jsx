import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const ALL_LINKS = [
  { to: '/',             label: 'Affichage',    role: null },
  { to: '/results-view', label: 'Résultats',    role: 'results_view' },
  { to: '/config',       label: 'Flux',         role: null },
  { to: '/streams-admin', label: 'Flux admin',  role: 'streams_admin' },
  { to: '/layouts',      label: 'Layouts',      role: null },
  { to: '/participants', label: 'Participants', role: 'participants' },
  { to: '/results-runs', label: 'Runs',         role: 'administration' },
  { to: '/admin',        label: 'Admin',        role: 'administration' },
  { to: '/results-archives', label: 'Archives', role: 'administration' },
];

export default function NavBar({ user, onLogout, roles, identityLabel }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const links = ALL_LINKS.filter(({ role }) => !role || roles?.[role]);

  return (
    <nav className="navbar">
      {/* ── Single row ── */}
      <div className="navbar-brand">Direct Diffusion</div>

      {/* Links — hidden on small screens */}
      <div className="navbar-links">
        {links.map(({ to, label }) => (
          <Link key={to} to={to} className={pathname === to ? 'active' : ''}>
            {label}
          </Link>
        ))}
      </div>

      <div className="navbar-right">
        <span className="navbar-email">{identityLabel || user?.email}</span>
        <button className="btn btn-secondary btn-sm navbar-logout" onClick={onLogout}>
          Déconnexion
        </button>

        {/* Burger — visible on small screens only */}
        <button
          className="navbar-burger"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={open}
        >
          <span /><span /><span />
        </button>
      </div>

      {/* Dropdown menu */}
      {open && (
        <>
          <div className="navbar-backdrop" onClick={close} />
          <div className="navbar-dropdown">
            {links.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={pathname === to ? 'active' : ''}
                onClick={close}
              >
                {label}
              </Link>
            ))}
            <div className="navbar-dropdown-divider" />
            <button className="navbar-dropdown-logout" onClick={() => { onLogout(); close(); }}>
              Déconnexion
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
