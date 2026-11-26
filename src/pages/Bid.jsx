import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, db } from '../lib/supabase'

const fmtTime = (t) =>
  t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : ''

export default function Bid() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const { employee, refreshEmployee } = useAuth()
  const [item, setItem] = useState(null)
  const [bid, setBid] = useState('')
  const [existingBid, setExistingBid] = useState(null)
  const [detail, setDetail] = useState(null)
  const [message, setMessage] = useState('')

  const isAdmin = employee?.role === 'admin'
  const available = (employee?.current_points || 0) - (employee?.locked_points || 0)
  const oldPoints = existingBid?.bid_points || 0

  useEffect(() => {
    loadItem()
    loadExistingBid()
    loadDetail()
  }, [])

  // 管理员在竞拍期间查看实时出价
  useEffect(() => {
    if (!isAdmin || item?.status !== 'active') return
    const timer = setInterval(loadDetail, 15000)
    return () => clearInterval(timer)
  }, [isAdmin, item?.status])

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
      .maybeSingle()
    if (data) {
      setExistingBid(data)
      setBid(String(data.bid_points))
    } else {
      setExistingBid(null)
    }
  }

  // 结标后所有人可看；竞拍期间只有管理员可看
  const loadDetail = async () => {
    if (!employee?.id) return
    try {
      const data = await db.getAuctionBidDetail(itemId, employee.id)
      setDetail(data)
    } catch (e) {
      setDetail(null)
    }
  }

  const handleSubmit = async () => {
    const pts = parseInt(bid, 10)
    if (!pts || pts <= 0) {
      setMessage('请输入有效出价')
      return
    }
    if (pts < item.base_points) {
      setMessage(`出价不可低于起标分 ${item.base_points}`)
      return
    }
    if (pts <= oldPoints) {
      setMessage(`出价只能上调：新出价必须高于当前出价 ${oldPoints} 分`)
      return
    }
    try {
      await db.submitBid(employee.id, itemId, pts)
      setMessage(`✅ ${existingBid ? '出价已上调' : '出价成功'}！${pts} 分`)
      await refreshEmployee()
      await loadExistingBid()
      await loadDetail()
    } catch (e) {
      setMessage('❌ ' + e.message)
    }
  }

  if (!item) return <div className="loading">加载中...</div>

  const highestBidders = detail?.highest_bidders || []
  const winner = detail?.winner

  return (
    <div className="app-container">
      <div className="navbar">
        <button className="back-btn" onClick={() => navigate('/auction')}>←</button>
        <span className="title">竞标</span>
        <span></span>
      </div>

      {message && <div className="toast">{message}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 20 }}>{item.item_name}</h2>
          <span className={`badge ${item.status === 'active' ? 'badge-active' : item.status === 'settled' ? 'badge-settled' : 'badge-pending'}`}>
            {item.status === 'active' ? '🔥 进行中' : item.status === 'settled' ? '已结标' : '未开始'}
          </span>
        </div>
        {item.description && <p style={{ color: '#666', marginBottom: 12 }}>{item.description}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#999', fontSize: 13 }}>起标积分</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#FF6B35' }}>{item.base_points}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#999', fontSize: 13 }}>结束时间</div>
            <div style={{ fontSize: 14 }}>{fmtTime(item.end_time)}</div>
          </div>
        </div>
      </div>

      {item.status === 'active' && (
        <>
          <div className="card" style={{ background: '#E8F5E9' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#999', fontSize: 13 }}>您的可用积分</div>
              <div style={{ fontSize: 36, fontWeight: 700, color: '#16C79A' }}>{available}</div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 4 }}>{existingBid ? '修改您的出价' : '输入您的出价'}</h3>
            <p style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
              出价可以修改，但只能往上加，不能下调
            </p>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={oldPoints + 1}
              placeholder={`起标 ${item.base_points} 分`}
              value={bid}
              onChange={(e) => setBid(e.target.value)}
            />
            {existingBid && (
              <p style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
                您当前出价：<b style={{ color: '#FF6B35' }}>{existingBid.bid_points}</b> 分
                （新出价必须高于此金额）
              </p>
            )}
            <button
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={handleSubmit}
              disabled={item.status !== 'active'}
            >
              {existingBid ? '提交上调出价' : '提交竞标'}
            </button>
          </div>

          {isAdmin && detail && (
            <BidDetail detail={detail} title="实时出价（仅管理员可见）" />
          )}

          {!isAdmin && (
            <p style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: '12px 20px' }}>
              结标后可查看所有出价记录
            </p>
          )}
        </>
      )}

      {item.status === 'settled' && (
        <>
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>竞标结果</h3>

            <div style={{ padding: 12, background: '#FFF8E1', borderRadius: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>获得物品者</div>
              {winner ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{winner.name}</span>
                    <span style={{ fontSize: 12, color: '#999', marginLeft: 6 }}>
                      {winner.department} · {winner.employee_no}
                    </span>
                  </div>
                  <span style={{ fontSize: 17, fontWeight: 700, color: '#FF6B35' }}>
                    {winner.win_points} 分
                  </span>
                </div>
              ) : (
                <div style={{ color: '#999' }}>流标（无人出价）</div>
              )}
            </div>

            <div style={{ padding: 12, background: '#f5f5f7', borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>出价最高者</div>
              {highestBidders.length > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>
                    {highestBidders.map((b) => b.name).join('、')}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#FF6B35' }}>
                    {detail?.highest_bid} 分
                  </span>
                </div>
              ) : (
                <div style={{ color: '#999' }}>无</div>
              )}
            </div>

            <div style={{ display: 'flex', marginTop: 12, textAlign: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#999' }}>出价人数</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{detail?.bidder_count ?? '-'}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#999' }}>出价总次数</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{detail?.bid_count ?? '-'}</div>
              </div>
            </div>
          </div>

          {detail && <BidDetail detail={detail} title="出价记录（按时间倒序）" showSummary={false} />}
        </>
      )}
    </div>
  )
}

// 管理员实时出价 / 结标后出价明细
function BidDetail({ detail, title, showSummary = true }) {
  const bids = detail.bids || []
  const highest = detail.highest_bid

  return (
    <div className="card">
      <h3 style={{ marginBottom: 12 }}>{title}</h3>

      {showSummary && (
        <div style={{ display: 'flex', textAlign: 'center', marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#999' }}>最高价</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#FF6B35' }}>
              {highest ?? '-'}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#999' }}>出价人数</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{detail.bidder_count ?? '-'}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#999' }}>出价总次数</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{detail.bid_count ?? '-'}</div>
          </div>
        </div>
      )}

      {bids.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#999', padding: 12 }}>暂无出价</p>
      ) : (
        bids.map((b, idx) => {
          const isHighest = highest !== null && b.bid_points === highest
          return (
            <div className="list-item" key={`${b.employee_no}-${b.created_at}-${idx}`}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>
                  {b.name}
                  <span style={{ fontSize: 11, marginLeft: 6, color: '#999' }}>{b.employee_no}</span>
                  {isHighest && <span style={{ marginLeft: 6, fontSize: 12 }}>🏆</span>}
                </div>
                <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>
                  {fmtTime(b.created_at)}
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: isHighest ? '#FF6B35' : '#333' }}>
                {b.bid_points} 分
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
