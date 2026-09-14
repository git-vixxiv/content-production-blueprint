import { Routes, Route } from 'react-router-dom'
import './appTheme.css'
import Dashboard from './pages/Dashboard'
import BlueprintDetail from './pages/BlueprintDetail'
import Heuristics from './pages/Heuristics'
import Creators from './pages/Creators'
import Settings from './pages/Settings'
import ExportToGithub from './pages/ExportToGithub'
import { Toaster } from './lib/shadcn/sonner'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/blueprint/:id" element={<BlueprintDetail />} />
        <Route path="/heuristics" element={<Heuristics />} />
        <Route path="/creators" element={<Creators />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/export" element={<ExportToGithub />} />
      </Routes>
      <Toaster />
    </>
  )
}
