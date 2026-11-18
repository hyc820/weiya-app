import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Home from './pages/Home'
import MyPoints from './pages/MyPoints'
import MyQR from './pages/MyQR'
import Ranking from './pages/Ranking'
import Game from './pages/Game'
import GameMaster from './pages/GameMaster'
import Auction from './pages/Auction'
import Bid from './pages/Bid'
import MyBids from './pages/MyBids'
import Winners from './pages/Winners'
import Announcement from './pages/Announcement'
import Admin from './pages/Admin'

// 路由守卫：未登录跳转到登录页
function ProtectedRoute({ children }) {
  const { employee, loading } = useAuth()
  if (loading) return <div className="loading">加载中...</div>
  if (!employee) return <Navigate to="/login" />
  return children
}

// 管理员路由守卫
function AdminRoute({ children }) {
  const { employee, loading } = useAuth()
  if (loading) return <div className="loading">加载中...</div>
  if (!employee) return <Navigate to="/login" />
  if (employee.role !== 'admin') return <Navigate to="/" />
  return children
}

// 关主路由守卫：仅关主与管理员可加分
function GameMasterRoute({ children }) {
  const { employee, loading } = useAuth()
  if (loading) return <div className="loading">加载中...</div>
  if (!employee) return <Navigate to="/login" />
  if (employee.role !== 'gamemaster' && employee.role !== 'admin') return <Navigate to="/" />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/points" element={<ProtectedRoute><MyPoints /></ProtectedRoute>} />
      <Route path="/my-qr" element={<ProtectedRoute><MyQR /></ProtectedRoute>} />
      <Route path="/ranking" element={<ProtectedRoute><Ranking /></ProtectedRoute>} />
      <Route path="/game" element={<ProtectedRoute><Game /></ProtectedRoute>} />
      <Route path="/game-master" element={<GameMasterRoute><GameMaster /></GameMasterRoute>} />
      <Route path="/auction" element={<ProtectedRoute><Auction /></ProtectedRoute>} />
      <Route path="/bid/:itemId" element={<ProtectedRoute><Bid /></ProtectedRoute>} />
      <Route path="/my-bids" element={<ProtectedRoute><MyBids /></ProtectedRoute>} />
      <Route path="/winners" element={<ProtectedRoute><Winners /></ProtectedRoute>} />
      <Route path="/announcement" element={<ProtectedRoute><Announcement /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
