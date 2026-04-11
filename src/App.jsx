import { useState, useCallback } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { loadConfig, saveConfig } from './utils/storage';
import NavBar from './components/NavBar';
import DisplayPage from './pages/DisplayPage';
import ConfigPage from './pages/ConfigPage';

export default function App() {
  const [config, setConfig] = useState(loadConfig);

  const updateConfig = useCallback((updater) => {
    setConfig((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveConfig(next);
      return next;
    });
  }, []);

  return (
    <HashRouter>
      <div className="app-root">
        <NavBar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<DisplayPage config={config} />} />
            <Route path="/config" element={<ConfigPage config={config} onUpdate={updateConfig} />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
