import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)

  // 启动时检查本地存储是否有登录信息
  useEffect(() => {
    const saved = localStorage.getItem('weiya_employee')
    if (saved) {
      const emp = JSON.parse(saved)
      setEmployee(emp)
    }
    setLoading(false)
  }, [])

  // 按当前积分实时计算名次（并列同名次）
  const withRealRank = async (emp) => {
    const { count } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .gt('current_points', emp.current_points)
    return { ...emp, rank_no: (count || 0) + 1 }
  }

  // 用工号登录（匹配预导入的员工名单）
  const login = async (employeeNo) => {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('employee_no', employeeNo.trim().toUpperCase())
      .single()

    if (error || !data) {
      throw new Error('工号不存在，请联系管理员')
    }

    const emp = await withRealRank(data)
    localStorage.setItem('weiya_employee', JSON.stringify(emp))
    setEmployee(emp)
    return emp
  }

  // 退出登录
  const logout = () => {
    localStorage.removeItem('weiya_employee')
    setEmployee(null)
  }

  // 刷新员工信息（积分变动后调用）
  const refreshEmployee = async () => {
    if (!employee) return
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employee.id)
      .single()
    if (data) {
      const emp = await withRealRank(data)
      localStorage.setItem('weiya_employee', JSON.stringify(emp))
      setEmployee(emp)
    }
  }

  return (
    <AuthContext.Provider value={{ employee, login, logout, refreshEmployee, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
