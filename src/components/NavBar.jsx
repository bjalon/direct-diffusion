import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useEventContext } from '../context/EventContext';
import { buildEventRoute, HOME_ROUTE } from '../utils/routes';

const ALL_LINKS = [
  { routeKey: 'display', label: 'Affichage', role: null },
  { routeKey: 'results', label: 'Résultats', role: 'results_view' },
  { routeKey: 'flow', label: 'Flow', role: null },
  { routeKey: 'flowAdmin', label: 'Flow admin', role: 'streams_admin' },
  { routeKey: 'layouts', label: 'Layouts', role: null },
  { routeKey: 'participants', label: 'Participants', role: 'participants' },
  { routeKey: 'runs', label: 'Runs', role: 'administration' },
  { routeKey: 'admin', label: 'Admin', role: 'administration' },
  { routeKey: 'archives', label: 'Archives', role: 'administration' },
];

export default function NavBar({ user, onLogout, roles, identityLabel, config, onSelectConfiguration }) {
  const { event } = useEventContext();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [configurationMenuOpen, setConfigurationMenuOpen] = useState(false);

  const close = () => {
    setOpen(false);
    setConfigurationMenuOpen(false);
  };

  const links = ALL_LINKS
    .filter(({ role }) => !role || roles?.[role])
    .map(({ routeKey, ...link }) => ({
      ...link,
      to: buildEventRoute(event.slug, routeKey),
    }));
  const configurationEntries = Object.entries(config?.configurations ?? {});
  const activeConfiguration = configurationEntries.find(([id]) => id === config?.activeConfigurationId)?.[1]
    ?? configurationEntries[0]?.[1]
    ?? null;

  return (
    <nav className="navbar">
      {/* ── Single row ── */}
      <Link to={HOME_ROUTE} className="navbar-brand">
        {event.title}
      </Link>

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
