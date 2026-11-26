import { createClient } from '@supabase/supabase-js'

// 替换成你的 Supabase 项目信息
// 在 Supabase 控制台 → Project Settings → API 里找到
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 数据库函数调用封装（保证事务原子性）
export const db = {
  // 签到
  checkIn: async (employeeId) => {
    const { data, error } = await supabase.rpc('check_in', { emp_id: employeeId })
    if (error) throw error
    return data[0]
  },

  // 游戏加分
  addGamePoint: async (employeeId, gameName, points, operator) => {
    const { data, error } = await supabase.rpc('add_game_point', {
      emp_id: employeeId,
      game: gameName,
      pts: points,
      operator_name: operator
    })
    if (error) throw error
    return data[0]
  },

  // 撤销游戏加分（管理员不限；关主限本人 10 分钟内）
  revokeGamePoint: async (gameRecordId, operatorId) => {
    const { data, error } = await supabase.rpc('revoke_game_point', {
      p_game_record_id: gameRecordId,
      p_operator_id: operatorId
    })
    if (error) throw error
    return data
  },

  // 提交出价
  submitBid: async (employeeId, itemId, bidPoints) => {
    const { data, error } = await supabase.rpc('submit_bid', {
      emp_id: employeeId,
      itm_id: itemId,
      bid_pts: bidPoints
    })
    if (error) throw error
    return data[0]
  },

  // 结标
  settleAuction: async (itemId) => {
    const { data, error } = await supabase.rpc('settle_auction', { itm_id: itemId })
    if (error) throw error
    return data
  },

  // 出价详情（结标后所有人可看，管理员竞拍期间即可看）
  getAuctionBidDetail: async (itemId, viewerId) => {
    const { data, error } = await supabase.rpc('get_auction_bid_detail', {
      p_item_id: itemId,
      p_viewer_id: viewerId
    })
    if (error) throw error
    return data
  },

  // 管理员调整积分
  adjustPoints: async (employeeId, points, operator, remark) => {
    const { data, error } = await supabase.rpc('adjust_points', {
      emp_id: employeeId,
      pts: points,
      operator_name: operator,
      remark: remark
    })
    if (error) throw error
    return data[0]
  },

  // 刷新排行榜
  refreshRanking: async () => {
    const { error } = await supabase.rpc('refresh_ranking')
    if (error) throw error
  },

  // 创建竞标商品（isBlind 为 true 时自动分配盲盒编号）
  createAuctionItem: async (name, basePoints, startTime, endTime, isBlind = false) => {
    const { data, error } = await supabase.rpc('create_auction_item', {
      p_name: name,
      p_base: basePoints,
      p_start: startTime,
      p_end: endTime,
      p_is_blind: isBlind
    })
    if (error) throw error
    return data
  },

  // 删除竞拍商品（仅管理员）
  deleteAuctionItem: async (itemId, operatorId) => {
    const { data, error } = await supabase.rpc('delete_auction_item', {
      p_item_id: itemId,
      p_operator_id: operatorId
    })
    if (error) throw error
    return data
  },

  // 管理员读取商品列表（含盲盒真实信息）
  getAdminItems: async (operatorId) => {
    const { data, error } = await supabase.rpc('get_auction_items_admin', {
      p_operator_id: operatorId
    })
    if (error) throw error
    return data || []
  },

  // 管理员读取单个商品（含盲盒真实信息）
  getAdminItem: async (itemId, operatorId) => {
    const { data, error } = await supabase.rpc('get_auction_item_admin', {
      p_item_id: itemId,
      p_operator_id: operatorId
    })
    if (error) throw error
    return (data && data[0]) || null
  }
}
