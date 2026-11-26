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

  // 用工号登录：一次请求完成查询、报到和排名计算
  const login = async (employeeNo) => {
    const { data, error } = await supabase.rpc('login_employee', {
      p_employee_no: employeeNo.trim()
    })

    if (error) {
      throw new Error(
        error.message.includes('工号不存在')
          ? '工号不存在，请联系管理员'
          : error.message || '登录失败'
      )
    }

    const emp = data && data[0]
    if (!emp) throw new Error('工号不存在，请联系管理员')

    localStorage.setItem('weiya_employee', JSON.stringify(emp))
    setEmployee(emp)
    return emp
  }

  // 退出登录
  const logout = () => {
    localStorage.removeItem('weiya_employee')
    setEmployee(null)
  }

  // 刷新员工信息（积分变动后调用，一次请求同时刷新排名）
  const refreshEmployee = async () => {
    if (!employee) return
    const { data } = await supabase.rpc('get_employee_profile', {
      p_employee_id: employee.id
    })
    const emp = data && data[0]
    if (emp) {
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
