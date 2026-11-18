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
  const [records, setRecords] = useState([])
  const [recordKeyword, setRecordKeyword] = useState('')
  const [showItemForm, setShowItemForm] = useState(false)
  const [form, setForm] = useState({ name: '', base: '100', start: '', end: '' })
  const [message, setMessage] = useState('')

  const TYPE_LABEL = {
    checkin: '报到',
    game: '游戏',
    auction: '竞标',
    admin: '管理员调整',
    refund: '回馈'
  }

  useEffect(() => {
    loadEmployees()
    loadItems()
    loadRecords()
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

  // 转成 datetime-local 需要的本地时间格式
  const toLocalInput = (d) => {
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  }

  const openItemForm = () => {
    setForm({
      name: '',
      base: '100',
      start: toLocalInput(new Date()),
      end: toLocalInput(new Date(Date.now() + 2 * 3600000))
    })
    setShowItemForm(true)
  }

  const handleCreateItem = async () => {
    const name = form.name.trim()
    const base = parseInt(form.base)

    if (!name) return showMsg('请输入商品名称')
    if (isNaN(base) || base < 0) return showMsg('请输入有效的起标积分')
    if (!form.start || !form.end) return showMsg('请选择开始和结束时间')

    const start = new Date(form.start)
    const end = new Date(form.end)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return showMsg('时间格式无效')
    if (end <= start) return showMsg('结束时间必须晚于开始时间')

    try {
      await db.createAuctionItem(name, base, start.toISOString(), end.toISOString())
      showMsg('✅ 商品已创建')
      setShowItemForm(false)
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

  // ===== 积分记录 =====
  const loadRecords = async () => {
    const { data } = await supabase
      .from('point_history')
      .select(`
        *,
        employees (name, employee_no, department)
      `)
      .order('created_at', { ascending: false })
      .limit(1000)
    setRecords(data || [])
  }

  const exportCSV = () => {
    const rows = [
      ['工号', '姓名', '部门', '积分变动', '类型', '来源/游戏', '操作人', '备注', '时间'],
      ...records.map((r) => [
        r.employees?.employee_no || '',
        r.employees?.name || '',
        r.employees?.department || '',
        r.points,
        TYPE_LABEL[r.point_type] || r.point_type,
        r.reference || '',
        r.operator || '',
        r.remark || '',
        new Date(r.created_at).toLocaleString('zh-CN')
      ])
    ]
    const csv = rows
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `积分记录_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const kw = recordKeyword.trim().toLowerCase()
  const filteredRecords = kw
    ? records.filter((r) =>
        (r.employees?.name || '').toLowerCase().includes(kw) ||
        (r.employees?.employee_no || '').toLowerCase().includes(kw)
      )
    : records

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
        <button
          className="btn"
          style={{
            flex: 1,
            padding: '8px',
            fontSize: 13,
            background: tab === 'records' ? '#FF6B35' : '#f0f0f0',
            color: tab === 'records' ? 'white' : '#333'
          }}
          onClick={() => { setTab('records'); loadRecords() }}
        >积分记录</button>
      </div>

      {/* 员工管理 */}
      {tab === 'employees' && (
        <div className="card">
          {employees.map((emp, idx) => (
            <div className="list-item" key={emp.id}>
              <div>
                <div style={{ fontWeight: 500 }}>
                  {emp.name}
                  <span style={{ fontSize: 11, marginLeft: 6, color: '#999' }}>{emp.employee_no}</span>
                </div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {emp.department} · 积分 {emp.current_points} · 排名 #{idx + 1}
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
            {!showItemForm && (
              <button className="btn btn-success" onClick={openItemForm}>+ 新增商品</button>
            )}

            {showItemForm && (
              <div className="card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>新增竞标商品</div>

                <label style={{ fontSize: 13, color: '#666' }}>商品名称</label>
                <input
                  className="input"
                  placeholder="例如：Nintendo Switch"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />

                <label style={{ fontSize: 13, color: '#666' }}>起标积分</label>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  value={form.base}
                  onChange={(e) => setForm({ ...form, base: e.target.value })}
                />

                <label style={{ fontSize: 13, color: '#666' }}>开始时间</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                />

                <label style={{ fontSize: 13, color: '#666' }}>结束时间</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-success" onClick={handleCreateItem}>确定创建</button>
                  <button className="btn btn-outline" onClick={() => setShowItemForm(false)}>取消</button>
                </div>
              </div>
            )}
          </div>
          {items.map((item) => (
            <div className="card" key={item.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.item_name}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    起标 {item.base_points} 分 · {item.end_time ? new Date(item.end_time).toLocaleString('zh-CN') : '未设置'}
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

      {/* 积分记录 */}
      {tab === 'records' && (
        <>
          <div style={{ padding: '12px 12px 0', display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="搜索姓名或工号"
              value={recordKeyword}
              onChange={(e) => setRecordKeyword(e.target.value)}
              style={{ marginBottom: 0, flex: 1 }}
            />
            <button
              className="btn btn-success"
              style={{ width: 'auto', padding: '0 16px' }}
              onClick={exportCSV}
            >导出 CSV</button>
          </div>

          <div style={{ padding: '8px 12px', fontSize: 12, color: '#999' }}>
            共 {filteredRecords.length} 条记录（最多显示最近 1000 条）
          </div>

          <div className="card">
            {filteredRecords.map((r) => (
              <div className="list-item" key={r.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {r.employees?.name || '未知'}
                    <span style={{ fontSize: 11, marginLeft: 6, color: '#999' }}>
                      {r.employees?.employee_no}
                    </span>
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        color: r.points >= 0 ? '#2A9D8F' : '#E63946'
                      }}
                    >
                      {r.points >= 0 ? '+' : ''}{r.points}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                    {TYPE_LABEL[r.point_type] || r.point_type}
                    {r.reference ? ` · ${r.reference}` : ''}
                    {r.operator ? ` · 操作人 ${r.operator}` : ''}
                    {r.remark ? ` · ${r.remark}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>
                    {new Date(r.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>
              </div>
            ))}
            {filteredRecords.length === 0 && (
              <p style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无记录</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
