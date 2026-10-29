import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

const signUpImage = "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=670&h=640&fit=crop"

export default function SignUp() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'student',
    password: '',
    confirmPassword: '',
    currentSemester: '1'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [agree, setAgree] = useState(false)

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      toast.error('Passwords do not match')
      return
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      toast.error('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const registerData = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role
      }
      if (formData.role === 'student') {
        registerData.currentSemester = parseInt(formData.currentSemester)
      }
      const userData = await register(registerData)
      toast.success('Account created successfully!')
      switch (userData.role) {
        case 'student': navigate('/student/dashboard'); break
        case 'professor': navigate('/professor/dashboard'); break
        case 'dept_admin': navigate('/dept-admin/overview'); break
        case 'inst_admin': navigate('/inst-admin/overview'); break
        case 'super_admin': navigate('/super-admin/overview'); break
        default: navigate('/student/dashboard')
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-[#f2f7ff] to-white">
      <div className="flex w-[1440px] max-w-full min-h-screen items-center justify-center px-8">
        {/* Left image */}
        <div className="hidden lg:block w-[670px] h-[640px] rounded-[20px] overflow-hidden shrink-0 mr-8">
          <img
            src={signUpImage}
            alt="Student studying"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Right form */}
        <div className="relative w-full max-w-[540px] rounded-[20px] p-10 bg-surface shadow-card border border-border">
          <h1 className="text-[40px] font-extrabold text-heading text-center mb-2">
            Create Account
          </h1>
          <p className="text-[16px] font-medium text-muted text-center mb-8">
            Join GlobalFlow AI to start learning
          </p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name */}
            <div>
              <label className="block text-[16px] text-heading mb-2">Full Name</label>
              <input
                type="text"
                name="name"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={handleChange}
                required
                className="form-input w-full"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[16px] text-heading mb-2">Email</label>
              <input
                type="email"
                name="email"
                placeholder="student@university.edu"
                value={formData.email}
                onChange={handleChange}
                required
                className="form-input w-full"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-[16px] text-heading mb-2">I am a</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="form-input w-full appearance-none cursor-pointer"
              >
                <option value="student">Student</option>
                <option value="professor">Professor</option>
              </select>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[16px] text-heading mb-2">Password</label>
              <input
                type="password"
                name="password"
                placeholder="Create a strong password"
                value={formData.password}
                onChange={handleChange}
                required
                className="form-input w-full"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[16px] text-heading mb-2">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                placeholder="Re-enter your password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className="form-input w-full"
              />
            </div>

            {/* Current Semester (for students only) */}
            {formData.role === 'student' && (
              <div>
                <label className="block text-[16px] text-heading mb-2">Current Semester *</label>
                <select
                  name="currentSemester"
                  value={formData.currentSemester}
                  onChange={handleChange}
                  required
                  className="form-input w-full appearance-none cursor-pointer"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                    <option key={s} value={s}>Semester {s}</option>
                  ))}
                </select>
                <p className="text-[12px] text-muted mt-1">You can only access lectures and labs from your current semester and previous semesters</p>
              </div>
            )}

            {/* Terms */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[#2563eb]"
              />
              <span className="text-[14px] text-heading">
                I agree to the{' '}
                <a href="#" className="text-primary hover:underline">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-primary hover:underline">Privacy Policy</a>
              </span>
            </label>

            {/* Sign up button */}
            <button
              type="submit"
              className="w-full h-[52px] bg-primary hover:bg-primary/90 rounded-[10px] text-white font-bold text-[16px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="spinner w-5 h-5"></span>
                  Creating Account...
                </span>
              ) : 'Create Account'}
            </button>

            {/* Sign in link */}
            <p className="text-center text-[16px] text-heading">
              Already have an account?{' '}
              <Link to="/signin" className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
