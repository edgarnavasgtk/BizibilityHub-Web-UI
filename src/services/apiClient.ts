import axios from 'axios'
import qs from 'qs'

const apiClient = axios.create({
  withCredentials: true,   // send ASP.NET Identity cookie on every request
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
  // ASP.NET MVC 5 / WebAPI uses traditional (repeat) array serialization:
  // BusinessSegmentIds=1&BusinessSegmentIds=2 instead of bracket notation.
  paramsSerializer: (params) => qs.stringify(params, { arrayFormat: 'repeat' }),
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
