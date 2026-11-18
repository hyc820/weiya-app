import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const GAMES = [
  { name: '套圈圈', min: 10, max: 50 },
  { name: '飞镖', min: 10, max: 50 },
  { name: '九宫格投球', min: 10, max: 50 },
  { name: '神射手', min: 10, max: 50 },
  { name: '趣味闯关', min: 20, max: 100 },
]

export default function Game() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [completed, setCompleted] = useState([])

  useEffect(() => {
    loadCompleted()
  }, [])

  const loadCompleted = async () => {
    const { data } = await supabase
      .from('game_record')
      .select('game_name')
      .eq('employee_id', employee.id)
    setCompleted((data || []).map((r) => r.game_name))
  }

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <span className="title">现场闯关游戏</span>
        <span></span>
      </div>

      <div className="card">
        {GAMES.map((game) => {
          const isDone = completed.includes(game.name)
          return (
            <div className="list-item" key={game.name}>
              <div>
                <div style={{ fontWeight: 500 }}>{game.name}</div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  积分奖励：{game.min} ~ {game.max} 分
                </div>
              </div>
              <span className={`badge ${isDone ? 'badge-active' : 'badge-pending'}`}>
                {isDone ? '✅ 已完成' : '◻ 未完成'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ background: '#FFF8E1' }}>
        <p style={{ fontSize: 13, color: '#666' }}>
          💡 请到各游戏摊位，由关主扫描您的工号二维码加分。每个游戏只能参加一次。
        </p>
      </div>
    </div>
  )
}
