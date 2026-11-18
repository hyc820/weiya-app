import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, db } from '../lib/supabase'

export default function Admin() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('employees')
  const [employees, setEmployees] = useState([])
  const [items, setItems] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadEmployees()
    loadItems()
  }, [])

  const showMsg = (msg) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 2500)
  }

  // ===== 员工管理 =====
  const loadEmployees = async () => {
    const { data } = await supabase
      .from('employees')
      .select('*')
      .order('current_points', { ascending: false })
    setEmployees(data || [])
  }

  const handleAdjustPoint = async (empId, name) => {
    const pts = prompt(`请输入要调整的积分（正数=加分，负数=扣分）\n员工：${name}`)
    if (pts === null) return
    const num = parseInt(pts)
    if (isNaN(num)) {
      showMsg('请输入有效数字')
      return
    }
    const remark = prompt('调整原因（选填）：') || ''
    try {
      await db.adjustPoints(empId, num, employee.name, remark)
      showMsg(`✅ ${name} 积分已调整 ${num > 0 ? '+' : ''}${num}`)
      loadEmployees()
    } catch (e) {
      showMsg('❌ ' + e.message)
    }
  }

  // ===== 商品管理 =====
  const loadItems = async () => {
    const { data } = await supabase
      .from('auction_items')
      .select('*')
      .order('start_time', { ascending: true })
    setItems(data || [])
  }

  const handleSettle = async (itemId, itemName) => {
    if (!confirm(`确认结算「${itemName}」？结算后不可撤销。`)) return
    try {
      const result = await db.settleAuction(itemId)
      showMsg(result)
      loadItems()
      loadEmployees()
    } catch (e) {
      showMsg('❌ ' + e.message)
    }
  }

  const handleCreateItem = async () => {
    const name = prompt('商品名称：')
    if (!name) return
    const base = prompt('起标积分：', '100')
    const start = prompt('开始时间（YYYY-MM-DD HH:MM）：', new Date().toLocaleString('zh-CN'))
    const end = prompt('结束时间（YYYY-MM-DD HH:MM）：', new Date(Date.now() + 2 * 3600000).toLocaleString('zh-CN'))

    try {
      await supabase.from('auction_items').insert({
        item_no: 'ITEM' + String(items.length + 1).padStart(3, '0'),
        item_name: name,
        base_points: parseInt(base),
        quantity: 1,
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        status: 'active'
      })
      showMsg('✅ 商品已创建')
      loadItems()
    } catch (e) {
      showMsg('❌ ' + e.message)
    }
  }

  // ===== 刷新排行榜 =====
  const handleRefreshRanking = async () => {
    try {
      await db.refreshRanking()
      showMsg('✅ 排行榜已刷新')
      loadEmployees()
    } catch (e) {
      showMsg('❌ ' + e.message)
    }
  }

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <span className="title">⚙️ 管理员后台</span>
        <span></span>
      </div>

      {message && <div className="toast">{message}</div>}

      {/* Tab 切换 */}
      <div style={{ display: 'flex', background: 'white', padding: '8px 12px', gap: 8 }}>
        <button
          className="btn"
          style={{
            flex: 1,
            padding: '8px',
            fontSize: 13,
            background: tab === 'employees' ? '#FF6B35' : '#f0f0f0',
            color: tab === 'employees' ? 'white' : '#333'
          }}
          onClick={() => setTab('employees')}
        >员工管理</button>
        <button
          className="btn"
          style={{
            flex: 1,
            padding: '8px',
            fontSize: 13,
            background: tab === 'items' ? '#FF6B35' : '#f0f0f0',
            color: tab === 'items' ? 'white' : '#333'
          }}
          onClick={() => setTab('items')}
        >商品管理</button>
        <button
          className="btn"
          style={{
            flex: 1,
            padding: '8px',
            fontSize: 13,
            background: tab === 'tools' ? '#FF6B35' : '#f0f0f0',
            color: tab === 'tools' ? 'white' : '#333'
          }}
          onClick={() => setTab('tools')}
        >工具</button>
      </div>

      {/* 员工管理 */}
      {tab === 'employees' && (
        <div className="card">
          {employees.map((emp) => (
            <div className="list-item" key={emp.id}>
              <div>
                <div style={{ fontWeight: 500 }}>
                  {emp.name}
                  <span style={{ fontSize: 11, marginLeft: 6, color: '#999' }}>{emp.employee_no}</span>
                </div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {emp.department} · 积分 {emp.current_points} · 排名 #{emp.rank_no || '-'}
                </div>
              </div>
              <button
                className="btn btn-outline"
                style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                onClick={() => handleAdjustPoint(emp.id, emp.name)}
              >调整积分</button>
            </div>
          ))}
        </div>
      )}

      {/* 商品管理 */}
      {tab === 'items' && (
        <>
          <div style={{ margin: 12 }}>
            <button className="btn btn-success" onClick={handleCreateItem}>+ 新增商品</button>
          </div>
          {items.map((item) => (
            <div className="card" key={item.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.item_name}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    起标 {item.base_points} 分 · {new Date(item.end_time).toLocaleString('zh-CN')}
                  </div>
                </div>
                <span className={`badge ${item.status === 'active' ? 'badge-active' : item.status === 'settled' ? 'badge-settled' : 'badge-pending'}`}>
                  {item.status === 'active' ? '进行中' : item.status === 'settled' ? '已结标' : '未开始'}
                </span>
              </div>
              {item.status === 'active' && (
                <button
                  className="btn btn-danger"
                  style={{ marginTop: 12 }}
                  onClick={() => handleSettle(item.id, item.item_name)}
                >立即结标</button>
              )}
            </div>
          ))}
        </>
      )}

      {/* 工具 */}
      {tab === 'tools' && (
        <div className="card">
          <button className="btn btn-primary" onClick={handleRefreshRanking}>
            🔄 刷新排行榜排名
          </button>
          <div style={{ marginTop: 16, padding: 12, background: '#f5f5f7', borderRadius: 8, fontSize: 13, color: '#666' }}>
            <p>💡 <b>导入员工名单：</b></p>
            <p>1. 准备 Excel：工号、姓名、部门、角色(admin/gamemaster/employee)</p>
            <p>2. 在 Supabase 控制台 → Table Editor → employees 表</p>
            <p>3. 点击「Import」上传 CSV 文件</p>
          </div>
        </div>
      )}
    </div>
  )
}
