import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, db } from '../lib/supabase'
import { adminItemLabel } from '../lib/itemName'

const ROLE_MAP = {
  admin: 'admin',
  管理员: 'admin',
  gamemaster: 'gamemaster',
  关主: 'gamemaster',
  employee: 'employee',
  员工: 'employee'
}

function parseEmployeeCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return { rows: [], errors: [] }

  const delim = lines[0].includes('\t') ? '\t' : ','
  const rows = []
  const errors = []

  lines.forEach((line, idx) => {
    const cells = line.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
    if (idx === 0 && /^(工号|employee_?no)$/i.test(cells[0])) return

    const employeeNo = cells[0] || ''
    const name = cells[1] || ''
    const department = cells[2] || ''
    const roleRaw = cells[3] || ''

    if (!employeeNo || !name) {
      errors.push(`第 ${idx + 1} 行：工号或姓名为空`)
      return
    }

    const role =
      ROLE_MAP[roleRaw] ||
      ROLE_MAP[roleRaw.toLowerCase()] ||
      (roleRaw ? '' : 'employee')

    if (!role) {
      errors.push(`第 ${idx + 1} 行：角色「${roleRaw}」无效（admin / gamemaster / employee）`)
      return
    }

    rows.push({
      employee_no: employeeNo.toUpperCase(),
      name,
      department,
      role
    })
  })

  return { rows, errors }
}

export default function Admin() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState(null)
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
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState({ rows: [], errors: [] })
  const [importing, setImporting] = useState(false)
  const [showItemForm, setShowItemForm] = useState(false)
  const [form, setForm] = useState({ name: '', base: '100', start: '', end: '', isBlind: false })
  const [message, setMessage] = useState('')

  // ===== 热场游戏 =====
  const [gameSessions, setGameSessions] = useState([])
  const [gameCurrent, setGameCurrent] = useState(null)
  const [gameTop, setGameTop] = useState([])
  const [gameStats, setGameStats] = useState({ participant_count: 0, total_score: 0, max_combo: 0 })
  const [gameBusy, setGameBusy] = useState(false)
  const [gameForm, setGameForm] = useState({
    title: '数钱大作战',
    duration: 30,
    rewards: [
      { from: 1, to: 1, points: 300 },
      { from: 2, to: 3, points: 200 },
      { from: 4, to: 10, points: 100 }
    ]
  })

  const GAME_STATUS = {
    waiting: '待开始',
    running: '进行中',
    settled: '已结算',
    cancelled: '已取消'
  }

  const TYPE_LABEL = {
    checkin: '报到',
    game: '游戏',
    game_revoke: '撤销游戏加分',
    auction: '竞标',
    admin: '管理员调整',
    refund: '回馈'
  }

  const TABS = [
    { key: 'employees', icon: '👥', label: '员工管理', desc: '积分调整、名单' },
    { key: 'items', icon: '🎁', label: '商品管理', desc: '新增、结标、删除' },
    { key: 'games', icon: '🎮', label: '游戏记录', desc: '撤销加分' },
    { key: 'announcements', icon: '📢', label: '活动公告', desc: '编辑、隐藏' },
    { key: 'money', icon: '💴', label: '热场游戏', desc: '发起、结算数钱' },
    { key: 'tools', icon: '🛠️', label: '维护工具', desc: '刷新排名、导入' },
    { key: 'records', icon: '📋', label: '积分记录', desc: '流水查询、导出' }
  ]

  const openTab = (key) => {
    setTab(key)
    if (key === 'employees') loadEmployees()
    if (key === 'items') loadItems()
    if (key === 'records') loadRecords()
    if (key === 'games') loadGameRecords()
    if (key === 'announcements') loadAnnouncements()
    if (key === 'money') loadGameAdmin()
  }

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

  // ===== 热场游戏 =====
  const loadGameAdmin = async () => {
    try {
      const list = await db.getGameSessionsAdmin(employee.id)
      setGameSessions(list)
      const cur = list[0] || null
      setGameCurrent(cur)
      if (cur) {
        const [top, stats] = await Promise.all([
          db.getGameLeaderboard(cur.id, 10),
          db.getGameStats(cur.id)
        ])
        setGameTop(top)
        setGameStats(stats)
      } else {
        setGameTop([])
        setGameStats({ participant_count: 0, total_score: 0, max_combo: 0 })
      }
    } catch (e) {
      showMsg('❌ ' + e.message)
    }
  }

  // 热场游戏页 2 秒轮询
  useEffect(() => {
    if (tab !== 'money') return
    loadGameAdmin()
    const timer = setInterval(loadGameAdmin, 2000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const runGameAction = async (action, successPrefix, confirmText) => {
    if (confirmText && !confirm(confirmText)) return
    if (gameBusy) return
    setGameBusy(true)
    try {
      const msg = await action()
      showMsg('✅ ' + (successPrefix || '') + (msg || ''))
      await loadGameAdmin()
      loadEmployees()
    } catch (e) {
      showMsg('❌ ' + e.message)
    } finally {
      setGameBusy(false)
    }
  }

  const handleStartGame = () =>
    runGameAction(
      () => db.startGameSession(gameCurrent.id, employee.id),
      '',
      `确认开始「${gameCurrent.title}」？开始后全员手机进入 ${gameCurrent.duration_seconds} 秒倒计时。`
    )

  const handleEndGame = () =>
    runGameAction(
      () => db.endGameSession(gameCurrent.id, employee.id),
      '',
      '确认提前结束本局？所有人立即停止，随后可结算发奖。'
    )

  const handleSettleGame = () => {
    const bands = (gameCurrent.rewards || [])
      .map((r) => `第 ${r.from}-${r.to} 名 +${r.points} 分`)
      .join('\n')
    return runGameAction(
      () => db.settleGameSession(gameCurrent.id, employee.id),
      '',
      `确认结算并发放积分？\n${bands || '（未配置奖励，不会发放积分）'}\n结算后不可重复发放。`
    )
  }

  const handleCancelGame = () =>
    runGameAction(
      () => db.cancelGameSession(gameCurrent.id, employee.id),
      '',
      '确认取消本局？取消后不发放积分。'
    )

  const handleDeleteGame = (s) => {
    const note =
      s.status === 'settled'
        ? '该局已结算，删除记录不会回收已发放的积分。'
        : '该局成绩记录将一并删除。'
    return runGameAction(
      () => db.deleteGameSession(s.id, employee.id),
      '',
      `确认删除「${s.title}」？\n${note}\n删除后不可恢复。`
    )
  }

  const copyGameConfig = (s) => {
    setGameForm({
      title: s.title,
      duration: s.duration_seconds,
      rewards: (s.rewards || []).map((r) => ({ from: r.from, to: r.to, points: r.points }))
    })
    showMsg('已复制配置，可在下方新建一局')
  }

  const handleCreateGame = async () => {
    if (gameBusy) return
    const title = gameForm.title.trim() || '数钱大作战'
    const rewards = gameForm.rewards.map((r) => ({
      from: Number(r.from),
      to: Number(r.to),
      points: Number(r.points)
    }))
    for (const r of rewards) {
      if (!r.from || !r.to || r.from < 1 || r.to < r.from || r.points < 0) {
        showMsg('❌ 奖励配置有误：名次需为正数，且结束名次不小于开始名次')
        return
      }
    }
    setGameBusy(true)
    try {
      await db.createGameSession(title, gameForm.duration, rewards, employee.id)
      showMsg('✅ 已创建新一局，可在大屏和员工端看到')
      loadGameAdmin()
    } catch (e) {
      showMsg('❌ ' + e.message)
    } finally {
      setGameBusy(false)
    }
  }

  const updateReward = (idx, key, value) => {
    setGameForm((f) => ({
      ...f,
      rewards: f.rewards.map((r, i) => (i === idx ? { ...r, [key]: value } : r))
    }))
  }

  const addReward = () => {
    setGameForm((f) => {
      const last = f.rewards[f.rewards.length - 1]
      const from = last ? Number(last.to) + 1 : 1
      return { ...f, rewards: [...f.rewards, { from, to: from, points: 0 }] }
    })
  }

  const removeReward = (idx) => {
    setGameForm((f) => ({ ...f, rewards: f.rewards.filter((_, i) => i !== idx) }))
  }

  const gameRemaining = (s) => {
    if (!s || s.status !== 'running' || !s.end_at) return 0
    return Math.max(0, Math.ceil((new Date(s.end_at).getTime() - Date.now()) / 1000))
  }

  const rewardTotal = gameForm.rewards.reduce((sum, r) => {
    const count = Math.max(0, (Number(r.to) || 0) - (Number(r.from) || 0) + 1)
    return sum + count * (Number(r.points) || 0)
  }, 0)
  const rewardMaxSingle = Math.max(0, ...gameForm.rewards.map((r) => Number(r.points) || 0))

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
  // ===== 员工导入 =====
  const handleImportTextChange = (value) => {
    setImportText(value)
    setImportPreview(parseEmployeeCsv(value))
  }

  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      setImportText(text)
      setImportPreview(parseEmployeeCsv(text))
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const handleImportEmployees = async () => {
    if (importPreview.errors.length > 0) {
      showMsg('❌ 请先修正格式错误')
      return
    }
    if (importPreview.rows.length === 0) {
      showMsg('❌ 没有可导入的数据')
      return
    }
    setImporting(true)
    try {
      const msg = await db.importEmployees(importPreview.rows, employee.id)
      showMsg('✅ ' + msg)
      setImportText('')
      setImportPreview({ rows: [], errors: [] })
      loadEmployees()
    } catch (e) {
      showMsg('❌ ' + e.message)
    } finally {
      setImporting(false)
    }
  }

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

      {/* 功能入口 / 子页导航 */}
      {tab === null ? (
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className="btn"
              style={{
                padding: '20px 12px',
                background: 'white',
                color: '#333',
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4
              }}
              onClick={() => openTab(t.key)}
            >
              <span style={{ fontSize: 30 }}>{t.icon}</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{t.label}</span>
              <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>{t.desc}</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'white' }}>
          <button
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
            onClick={() => setTab(null)}
          >← 返回</button>
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            {TABS.find((t) => t.key === tab)?.icon} {TABS.find((t) => t.key === tab)?.label}
          </span>
        </div>
      )}

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

      {/* 热场游戏 */}
      {tab === 'money' && (
        <div style={{ padding: 12 }}>
          <button
            className="btn btn-primary"
            onClick={() => window.open(`${import.meta.env.BASE_URL}stage`, '_blank')}
          >
            🖥️ 打开大屏（新窗口）
          </button>

          {gameCurrent ? (
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{gameCurrent.title}</div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                    {gameCurrent.duration_seconds} 秒 ·{' '}
                    {new Date(gameCurrent.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>
                <span
                  className="badge"
                  style={{
                    background:
                      gameCurrent.status === 'running' ? '#FF6B35' :
                      gameCurrent.status === 'settled' ? '#2A9D8F' :
                      gameCurrent.status === 'cancelled' ? '#999' : '#FFB703',
                    color: 'white'
                  }}
                >
                  {GAME_STATUS[gameCurrent.status] || gameCurrent.status}
                </span>
              </div>

              {gameCurrent.status === 'running' && (
                <div style={{ marginTop: 14, textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 44,
                      fontWeight: 900,
                      color: gameRemaining(gameCurrent) <= 5 ? '#E63946' : '#FF6B35',
                      fontVariantNumeric: 'tabular-nums',
                      lineHeight: 1.1
                    }}
                  >
                    {gameRemaining(gameCurrent)}s
                  </div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {gameRemaining(gameCurrent) > 0 ? '剩余时间' : '时间到，请结算发奖'}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 14, textAlign: 'center' }}>
                <div style={{ flex: 1, background: '#fafafa', borderRadius: 8, padding: '8px 4px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{Number(gameStats.participant_count || 0)}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>参与人数</div>
                </div>
                <div style={{ flex: 1, background: '#fafafa', borderRadius: 8, padding: '8px 4px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>¥{Number(gameStats.total_score || 0).toLocaleString('zh-CN')}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>累计金额</div>
                </div>
                <div style={{ flex: 1, background: '#fafafa', borderRadius: 8, padding: '8px 4px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>x{Number(gameStats.max_combo || 0)}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>最高连击</div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7, marginTop: 12 }}>
                {(gameCurrent.rewards || []).length > 0
                  ? gameCurrent.rewards.map((r) => `第 ${r.from}-${r.to} 名 +${r.points} 分`).join(' · ')
                  : '未配置奖励'}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {gameCurrent.status === 'waiting' && (
                  <button className="btn btn-success" style={{ flex: 1, minWidth: 120 }} disabled={gameBusy} onClick={handleStartGame}>
                    ▶ 开始游戏
                  </button>
                )}
                {gameCurrent.status === 'running' && (
                  <>
                    <button className="btn btn-danger" style={{ flex: 1, minWidth: 120 }} disabled={gameBusy} onClick={handleEndGame}>
                      ⏹ 提前结束
                    </button>
                    <button className="btn btn-success" style={{ flex: 1, minWidth: 120 }} disabled={gameBusy} onClick={handleSettleGame}>
                      💰 结算发奖
                    </button>
                  </>
                )}
                {(gameCurrent.status === 'waiting' || gameCurrent.status === 'cancelled') && (
                  <button className="btn btn-outline" style={{ flex: 1, minWidth: 120 }} onClick={() => copyGameConfig(gameCurrent)}>
                    复制配置
                  </button>
                )}
                {gameCurrent.status === 'waiting' && (
                  <button className="btn btn-outline" style={{ flex: 1, minWidth: 120 }} disabled={gameBusy} onClick={handleCancelGame}>
                    取消本局
                  </button>
                )}
                {gameCurrent.status === 'settled' && (
                  <button className="btn btn-outline" style={{ flex: 1, minWidth: 120 }} onClick={() => copyGameConfig(gameCurrent)}>
                    复制配置再来一局
                  </button>
                )}
                <button
                  className="btn btn-outline"
                  style={{ flex: 1, minWidth: 120, color: '#E63946', borderColor: '#E63946' }}
                  disabled={gameBusy}
                  onClick={() => handleDeleteGame(gameCurrent)}
                >
                  删除记录
                </button>
              </div>

              {gameTop.length > 0 && (
                <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>实时前 10</div>
                  {gameTop.map((p) => (
                    <div key={p.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13 }}>
                      <span style={{ width: 22, color: '#999', fontWeight: 700 }}>{p.rank_no}</span>
                      <span style={{ flex: 1 }}>
                        {p.name}
                        <span style={{ color: '#bbb', fontSize: 11, marginLeft: 6 }}>{p.department}</span>
                      </span>
                      <span style={{ color: '#FF6B35', fontWeight: 700 }}>¥{p.score.toLocaleString('zh-CN')}</span>
                      <span style={{ color: '#999', width: 42, textAlign: 'right' }}>x{p.max_combo}</span>
                      {p.reward_points > 0 && (
                        <span style={{ color: '#2A9D8F', width: 52, textAlign: 'right' }}>+{p.reward_points}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card" style={{ marginTop: 12, textAlign: 'center', color: '#999' }}>
              还没有比赛，先在下方创建一局
            </div>
          )}

          <div className="card">
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>新建一局</h3>

            <label style={{ fontSize: 13, color: '#666' }}>标题</label>
            <input
              className="input"
              value={gameForm.title}
              onChange={(e) => setGameForm({ ...gameForm, title: e.target.value })}
              placeholder="数钱大作战"
            />

            <label style={{ fontSize: 13, color: '#666' }}>时长</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {[20, 30, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  className="btn"
                  style={{
                    flex: 1,
                    padding: 10,
                    fontSize: 13,
                    background: gameForm.duration === d ? '#FF6B35' : '#f0f0f0',
                    color: gameForm.duration === d ? 'white' : '#333'
                  }}
                  onClick={() => setGameForm({ ...gameForm, duration: d })}
                >
                  {d} 秒
                </button>
              ))}
            </div>

            <label style={{ fontSize: 13, color: '#666' }}>奖励配置（按名次区间）</label>
            {gameForm.rewards.map((r, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#999' }}>第</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  style={{ marginBottom: 0, width: 56 }}
                  value={r.from}
                  onChange={(e) => updateReward(idx, 'from', e.target.value)}
                />
                <span style={{ fontSize: 12, color: '#999' }}>-</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  style={{ marginBottom: 0, width: 56 }}
                  value={r.to}
                  onChange={(e) => updateReward(idx, 'to', e.target.value)}
                />
                <span style={{ fontSize: 12, color: '#999' }}>名 +</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  style={{ marginBottom: 0, flex: 1 }}
                  value={r.points}
                  onChange={(e) => updateReward(idx, 'points', e.target.value)}
                />
                <span style={{ fontSize: 12, color: '#999' }}>分</span>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '4px 8px', fontSize: 12, color: '#E63946', borderColor: '#E63946' }}
                  onClick={() => removeReward(idx)}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: 8, fontSize: 13, marginTop: 4 }}
              onClick={addReward}
            >
              + 添加奖励档位
            </button>

            <div style={{ fontSize: 12, color: '#666', margin: '10px 0', lineHeight: 1.6 }}>
              最高单人 <b style={{ color: '#FF6B35' }}>{rewardMaxSingle}</b> 分 · 全部发放合计{' '}
              <b style={{ color: '#FF6B35' }}>{rewardTotal}</b> 分
            </div>

            <button className="btn btn-success" disabled={gameBusy} onClick={handleCreateGame}>
              {gameBusy ? '处理中…' : '创建比赛'}
            </button>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 16, marginBottom: 10 }}>历史记录</h3>
            {gameSessions.length === 0 && (
              <p style={{ textAlign: 'center', color: '#999', padding: 12 }}>暂无记录</p>
            )}
            {gameSessions.map((s) => (
              <div className="list-item" key={s.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {s.title}
                    <span style={{ fontSize: 11, marginLeft: 6, color: '#999' }}>
                      {GAME_STATUS[s.status] || s.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                    {s.duration_seconds} 秒 · {Number(s.participant_count)} 人 · 最高 ¥{Number(s.top_score).toLocaleString('zh-CN')} ·{' '}
                    {new Date(s.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}
                    onClick={() => copyGameConfig(s)}
                  >复制</button>
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '5px 10px', fontSize: 12, color: '#E63946', borderColor: '#E63946' }}
                    disabled={gameBusy}
                    onClick={() => handleDeleteGame(s)}
                  >删除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 工具 */}
      {tab === 'tools' && (
        <div className="card">
          <button className="btn btn-primary" onClick={handleRefreshRanking}>
            🔄 刷新排行榜排名
          </button>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <h4 style={{ fontSize: 15, marginBottom: 8 }}>💴 数钱大作战</h4>
            <p style={{ fontSize: 12, color: '#999', lineHeight: 1.6, marginBottom: 10 }}>
              已整合为正式版：在「热场游戏」中创建并发起，员工从首页进入，大屏打开 /stage。
              原型页 /money-demo 与 /stage-demo 仍保留，可用于演示或回滚。
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={`${import.meta.env.BASE_URL}money-game`}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  padding: 10,
                  background: '#FF6B35',
                  color: 'white',
                  borderRadius: 8,
                  textAlign: 'center',
                  fontSize: 13,
                  textDecoration: 'none'
                }}
              >
                员工端入口
              </a>
              <a
                href={`${import.meta.env.BASE_URL}stage`}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  padding: 10,
                  background: '#f0f0f0',
                  color: '#333',
                  borderRadius: 8,
                  textAlign: 'center',
                  fontSize: 13,
                  textDecoration: 'none'
                }}
              >
                大屏入口
              </a>
            </div>
          </div>

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <h4 style={{ fontSize: 15, marginBottom: 8 }}>📥 导入员工名单</h4>
            <p style={{ fontSize: 12, color: '#999', lineHeight: 1.6, marginBottom: 8 }}>
              每行一人，格式：工号,姓名,部门,角色。
              角色可填 admin / gamemaster / employee，也可填 管理员 / 关主 / 员工。
              已存在的工号只更新姓名、部门、角色，不影响积分和签到状态。
            </p>

            <textarea
              className="input"
              rows={6}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}
              placeholder={'EMP006,周七,财务部,employee\nEMP007,孙八,市场部,gamemaster'}
              value={importText}
              onChange={(e) => handleImportTextChange(e.target.value)}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <label
                style={{
                  flex: 1,
                  padding: 10,
                  background: '#f0f0f0',
                  borderRadius: 8,
                  textAlign: 'center',
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                选择 CSV 文件
                <input
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={handleImportFile}
                />
              </label>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: 10, fontSize: 13 }}
                disabled={importing}
                onClick={handleImportEmployees}
              >
                {importing ? '导入中…' : `导入 ${importPreview.rows.length} 人`}
              </button>
            </div>

            {importPreview.errors.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#E63946', lineHeight: 1.6 }}>
                {importPreview.errors.slice(0, 5).map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
                {importPreview.errors.length > 5 && (
                  <div>… 共 {importPreview.errors.length} 处错误</div>
                )}
              </div>
            )}

            {importPreview.rows.length > 0 && importPreview.errors.length === 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#16A34A' }}>
                已解析 {importPreview.rows.length} 人，可导入
              </div>
            )}
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
