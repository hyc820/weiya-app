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
  }
}
