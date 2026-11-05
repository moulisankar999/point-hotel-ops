import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AppProvider } from './state/AppContext'
import { Toasts } from './components/Toasts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <HashRouter>
        <App />
        <Toasts />
      </HashRouter>
    </AppProvider>
  </StrictMode>,
)
