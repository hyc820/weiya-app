import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, db } from '../lib/supabase'

export default function Bid() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const { employee, refreshEmployee } = useAuth()
  const [item, setItem] = useState(null)
  const [bid, setBid] = useState('')
  const [existingBid, setExistingBid] = useState(null)
  const [message, setMessage] = useState('')

  const available = (employee?.current_points || 0) - (employee?.locked_points || 0)

  useEffect(() => {
    loadItem()
    loadExistingBid()
  }, [])

  const loadItem = async () => {
    const { data } = await supabase
      .from('auction_items')
      .select('*')
      .eq('id', itemId)
      .single()
    setItem(data)
  }

  const loadExistingBid = async () => {
    const { data } = await supabase
      .from('auction_bids')
      .select('*')
      .eq('item_id', itemId)
      .eq('employee_id', employee.id)
      .eq('status', 'active')
      .single()
    if (data) {
      setExistingBid(data)
      setBid(String(data.bid_points))
    }
  }

  const handleSubmit = async () => {
    const pts = parseInt(bid)
    if (!pts || pts <= 0) {
      setMessage('请输入有效出价')
      return
    }
    try {
      await db.submitBid(employee.id, itemId, pts)
      setMessage(`✅ 出价成功！${pts} 分`)
      await refreshEmployee()
      await loadExistingBid()
    } catch (e) {
      setMessage('❌ ' + e.message)
    }
  }

  if (!item) return <div className="loading">加载中...</div>

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/auction')}>←</button>
        <span className="title">竞标</span>
        <span></span>
      </div>

      {message && <div className="toast">{message}</div>}

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>{item.item_name}</h2>
        {item.description && <p style={{ color: '#666', marginBottom: 12 }}>{item.description}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#999', fontSize: 13 }}>起标积分</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#FF6B35' }}>{item.base_points}</div>
          </div>
          <div>
            <div style={{ color: '#999', fontSize: 13 }}>结束时间</div>
            <div style={{ fontSize: 14 }}>{new Date(item.end_time).toLocaleString('zh-CN')}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ background: '#E8F5E9' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#999', fontSize: 13 }}>您的可用积分</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#16C79A' }}>{available}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>输入您的出价</h3>
        <input
          className="input"
          type="number"
          placeholder={`起标 ${item.base_points} 分`}
          value={bid}
          onChange={(e) => setBid(e.target.value)}
        />
        {existingBid && (
          <p style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
            您当前出价：{existingBid.bid_points} 分（提交将更新出价）
          </p>
        )}
        <button
          className="btn btn-primary"
          style={{ marginTop: 16 }}
          onClick={handleSubmit}
          disabled={item.status !== 'active'}
        >
          {item.status === 'active' ? '提交竞标' : '竞标已结束'}
        </button>
      </div>
    </div>
  )
}
