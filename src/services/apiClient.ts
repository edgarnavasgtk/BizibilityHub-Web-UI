import axios from 'axios'

const apiClient = axios.create({
  withCredentials: true,   // send ASP.NET Identity cookie on every request
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
})

// redirect to login on 401 / 302-to-login
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default apiClient
