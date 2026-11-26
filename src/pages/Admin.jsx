import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, db } from '../lib/supabase'
import { adminItemLabel } from '../lib/itemName'

export default function Admin() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('employees')
  const [employees, setEmployees] = useState([])
  const [items, setItems] = useState([])
  const [records, setRecords] = useState([])
  const [gameRecords, setGameRecords] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false)
  const [announcementForm, setAnnouncementForm] = useState({
    id: null,
    title: '',
    content: '',
    sort: '0',
    active: true
  })
  const [recordKeyword, setRecordKeyword] = useState('')
  const [showItemForm, setShowItemForm] = useState(false)
  const [form, setForm] = useState({ name: '', base: '100', start: '', end: '', isBlind: false })
  const [message, setMessage] = useState('')

  const TYPE_LABEL = {
    checkin: '报到',
    game: '游戏',
    game_revoke: '撤销游戏加分',
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

  // ===== 游戏记录 =====
  const loadGameRecords = async () => {
    const { data } = await supabase
      .from('game_record')
      .select(`
        *,
        employees (name, employee_no, department)
      `)
      .order('created_at', { ascending: false })
      .limit(500)
    setGameRecords(data || [])
  }

  const handleRevokeGame = async (rec) => {
    const empName = rec.employees?.name || '该员工'
    if (!confirm(`确认撤销「${empName}」在「${rec.game_name}」的 +${rec.points} 分？\n撤销后积分扣回，该员工可重新参与此游戏。`)) return
    try {
      const msg = await db.revokeGamePoint(rec.id, employee.id)
      showMsg('✅ ' + msg)
      loadGameRecords()
      loadEmployees()
    } catch (e) {
      showMsg('❌ ' + e.message)
    }
  }

  // ===== 活动公告 =====
  const loadAnnouncements = async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    setAnnouncements(data || [])
  }

  const openAnnouncementForm = (a = null) => {
    setAnnouncementForm(
      a
        ? {
            id: a.id,
            title: a.title,
            content: a.content,
            sort: String(a.sort_order),
            active: a.is_active
          }
        : { id: null, title: '', content: '', sort: '0', active: true }
    )
    setShowAnnouncementForm(true)
  }

  const handleSaveAnnouncement = async () => {
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) {
      showMsg('❌ 标题和内容不能为空')
      return
    }
    try {
      await db.saveAnnouncement({
        id: announcementForm.id,
        title: announcementForm.title,
        content: announcementForm.content,
        sortOrder: Number(announcementForm.sort) || 0,
        isActive: announcementForm.active,
        operatorId: employee.id
      })
      showMsg('✅ 公告已保存')
      setShowAnnouncementForm(false)
      loadAnnouncements()
    } catch (e) {
      showMsg('❌ ' + e.message)
    }
  }

  const handleDeleteAnnouncement = async (a) => {
    if (!confirm(`确认删除公告「${a.title}」？删除后不可恢复。`)) return
    try {
      const msg = await db.deleteAnnouncement(a.id, employee.id)
      showMsg('✅ ' + msg)
      loadAnnouncements()
    } catch (e) {
      showMsg('❌ ' + e.message)
    }
  }

  // ===== 商品管理 =====
  const loadItems = async () => {
    try {
      setItems(await db.getAdminItems(employee.id))
    } catch (e) {
      setItems([])
      showMsg('❌ ' + e.message)
    }
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

  const handleDeleteItem = async (item) => {
    const note =
      item.status === 'active'
        ? '该商品竞拍进行中，删除后出价记录将被清除，并释放已冻结的积分。'
        : item.status === 'settled'
          ? '该商品已结标，删除后出价与得标记录将被清除；已扣积分不会自动退回。'
          : '该商品尚未开始。'
    if (!confirm(`确认删除「${item.item_name}」？\n${note}\n删除后不可恢复。`)) return
    try {
      const result = await db.deleteAuctionItem(item.id, employee.id)
      showMsg('✅ ' + result)
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
      end: toLocalInput(new Date(Date.now() + 2 * 3600000)),
      isBlind: false
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
      await db.createAuctionItem(name, base, start.toISOString(), end.toISOString(), form.isBlind)
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
      <div style={{ display: 'flex', background: 'white', padding: '8px 12px', gap: 6, overflowX: 'auto' }}>
        {[
          { key: 'employees', label: '员工管理' },
          { key: 'items', label: '商品管理' },
          { key: 'games', label: '游戏记录' },
          { key: 'announcements', label: '活动公告' },
          { key: 'tools', label: '工具' },
          { key: 'records', label: '积分记录' }
        ].map((t) => (
          <button
            key={t.key}
            className="btn"
            style={{
              flex: '0 0 auto',
              padding: '8px 10px',
              fontSize: 12,
              whiteSpace: 'nowrap',
              background: tab === t.key ? '#FF6B35' : '#f0f0f0',
              color: tab === t.key ? 'white' : '#333'
            }}
            onClick={() => {
              setTab(t.key)
              if (t.key === 'records') loadRecords()
              if (t.key === 'games') loadGameRecords()
              if (t.key === 'announcements') loadAnnouncements()
            }}
          >{t.label}</button>
        ))}
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

                <label style={{ fontSize: 13, color: '#666' }}>竞拍类型</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      flex: 1,
                      padding: 10,
                      fontSize: 13,
                      background: form.isBlind ? '#f0f0f0' : '#FF6B35',
                      color: form.isBlind ? '#333' : 'white'
                    }}
                    onClick={() => setForm({ ...form, isBlind: false })}
                  >公开竞拍</button>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      flex: 1,
                      padding: 10,
                      fontSize: 13,
                      background: form.isBlind ? '#FF6B35' : '#f0f0f0',
                      color: form.isBlind ? 'white' : '#333'
                    }}
                    onClick={() => setForm({ ...form, isBlind: true })}
                  >盲盒竞拍</button>
                </div>
                <p style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
                  盲盒结标前对外只显示「盲盒N」，并隐藏图片与描述；结标后显示「盲盒N-真实名称」。
                </p>

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
                  <div style={{ fontWeight: 600 }}>{adminItemLabel(item)}</div>
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
              <button
                className="btn btn-outline"
                style={{ marginTop: 8 }}
                onClick={() => navigate(`/bid/${item.id}`)}
              >查看出价详情</button>
              <button
                className="btn btn-outline"
                style={{ marginTop: 8, color: '#E63946', borderColor: '#E63946' }}
                onClick={() => handleDeleteItem(item)}
              >删除商品</button>
            </div>
          ))}
        </>
      )}

      {/* 游戏记录 */}
      {tab === 'games' && (
        <>
          <div style={{ padding: '12px 12px 0', fontSize: 12, color: '#999' }}>
            共 {gameRecords.length} 条记录（最多显示最近 500 条）
          </div>
          <div className="card">
            {gameRecords.map((r) => (
              <div className="list-item" key={r.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {r.employees?.name || '未知'}
                    <span style={{ fontSize: 11, marginLeft: 6, color: '#999' }}>
                      {r.employees?.employee_no}
                    </span>
                    <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 600, color: '#2A9D8F' }}>
                      +{r.points}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                    {r.game_name} · 操作人 {r.operator} · {new Date(r.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '6px 10px', fontSize: 12, color: '#E63946', borderColor: '#E63946' }}
                  onClick={() => handleRevokeGame(r)}
                >撤销</button>
              </div>
            ))}
            {gameRecords.length === 0 && (
              <p style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无游戏加分记录</p>
            )}
          </div>
        </>
      )}

      {/* 活动公告 */}
      {tab === 'announcements' && (
        <>
          <div style={{ padding: '12px 12px 0' }}>
            <button
              className="btn btn-primary"
              style={{ padding: '10px', fontSize: 14 }}
              onClick={() => openAnnouncementForm()}
            >+ 新增公告</button>
          </div>

          {showAnnouncementForm && (
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>
                {announcementForm.id ? '编辑公告' : '新增公告'}
              </h3>

              <label style={{ fontSize: 13, color: '#666' }}>标题</label>
              <input
                className="input"
                value={announcementForm.title}
                placeholder="例如：活动流程"
                onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
              />

              <label style={{ fontSize: 13, color: '#666' }}>内容</label>
              <textarea
                className="input"
                rows={5}
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                value={announcementForm.content}
                placeholder="支持换行，例如：18:00 签到 → 18:30 闯关游戏"
                onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
              />

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, color: '#666' }}>排序（越小越靠前）</label>
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    value={announcementForm.sort}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, sort: e.target.value })}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={announcementForm.active}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, active: e.target.checked })}
                  />
                  显示中
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveAnnouncement}>
                  保存
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAnnouncementForm(false)}>
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="card">
            {announcements.map((a) => (
              <div className="list-item" key={a.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {a.title}
                    {!a.is_active && (
                      <span className="badge badge-settled" style={{ marginLeft: 6 }}>已隐藏</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4, whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                    {a.content}
                  </div>
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>排序 {a.sort_order}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}
                    onClick={() => openAnnouncementForm(a)}
                  >编辑</button>
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '6px 10px', fontSize: 12, color: '#E63946', borderColor: '#E63946' }}
                    onClick={() => handleDeleteAnnouncement(a)}
                  >删除</button>
                </div>
              </div>
            ))}
            {announcements.length === 0 && (
              <p style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无公告</p>
            )}
          </div>
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
