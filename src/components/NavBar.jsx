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

export default function NavBar({ user, onLogout, roles, identityLabel, config, onSelectConfiguration }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [configurationMenuOpen, setConfigurationMenuOpen] = useState(false);

  const close = () => {
    setOpen(false);
    setConfigurationMenuOpen(false);
  };

  const links = ALL_LINKS.filter(({ role }) => !role || roles?.[role]);
  const configurationEntries = Object.entries(config?.configurations ?? {});
  const activeConfiguration = configurationEntries.find(([id]) => id === config?.activeConfigurationId)?.[1]
    ?? configurationEntries[0]?.[1]
    ?? null;

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
        {activeConfiguration && (
          <div className="navbar-configuration">
            <button
              className={`navbar-configuration-button${configurationMenuOpen ? ' active' : ''}`}
              onClick={() => setConfigurationMenuOpen((value) => !value)}
              type="button"
              aria-haspopup="menu"
              aria-expanded={configurationMenuOpen}
              title="Choisir la disposition affichée"
            >
              <span className="navbar-configuration-label">{activeConfiguration.name || 'Configuration'}</span>
              <span className="navbar-configuration-caret">▾</span>
            </button>

            {configurationMenuOpen && (
              <div className="navbar-configuration-dropdown" role="menu">
                {configurationEntries.map(([configurationId, configuration]) => (
                  <button
                    key={configurationId}
                    className={`navbar-configuration-item${configurationId === config?.activeConfigurationId ? ' active' : ''}`}
                    type="button"
                    onClick={() => {
                      onSelectConfiguration(configurationId);
                      setConfigurationMenuOpen(false);
                    }}
                  >
                    {configuration.name || 'Configuration'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
            {configurationEntries.length > 0 && (
              <>
                <div className="navbar-dropdown-heading">Disposition affichée</div>
                {configurationEntries.map(([configurationId, configuration]) => (
                  <button
                    key={configurationId}
                    className={`navbar-dropdown-action${configurationId === config?.activeConfigurationId ? ' active' : ''}`}
                    onClick={() => {
                      onSelectConfiguration(configurationId);
                      close();
                    }}
                    type="button"
                  >
                    {configuration.name || 'Configuration'}
                  </button>
                ))}
                <div className="navbar-dropdown-divider" />
              </>
            )}
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
