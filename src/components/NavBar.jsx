import { Link, useLocation } from 'react-router-dom';

export default function NavBar() {
  const { pathname } = useLocation();

  return (
    <nav className="navbar">
      <div className="navbar-brand">Direct Diffusion</div>
      <div className="navbar-links">
        <Link to="/" className={pathname === '/' ? 'active' : ''}>
          Affichage
        </Link>
        <Link to="/config" className={pathname === '/config' ? 'active' : ''}>
          Configuration
        </Link>
      </div>
    </nav>
  );
}
