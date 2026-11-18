import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Announcement() {
  const navigate = useNavigate()
  const [list, setList] = useState([])

  useEffect(() => {
    loadList()
  }, [])

  const loadList = async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    setList(data || [])
  }

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <span className="title">活动公告</span>
        <span></span>
      </div>

      {list.length === 0 ? (
        <div className="empty">暂无公告</div>
      ) : (
        list.map((a) => (
          <div className="card" key={a.id}>
            <h3 style={{ marginBottom: 8 }}>{a.title}</h3>
            <p style={{ color: '#666', whiteSpace: 'pre-line', lineHeight: 1.6 }}>{a.content}</p>
            <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
              {new Date(a.created_at).toLocaleDateString('zh-CN')}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
