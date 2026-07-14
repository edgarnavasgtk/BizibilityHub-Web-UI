import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SectionKey } from '../constants/sectionKeys'
import { AllSections } from '../constants/sectionKeys'

export interface AuthUser {
  id: string
  displayName: string
  email: string
  role: 'Admin' | 'User' | string
}

interface AuthState {
  user: AuthUser | null
  sections: Set<SectionKey>
  isAuthenticated: boolean
  isAdmin: boolean
  setUser: (user: AuthUser, sections: SectionKey[]) => void
  logout: () => void
  canSee: (key: SectionKey) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      sections: new Set<SectionKey>(),
      isAuthenticated: false,
      isAdmin: false,

      setUser: (user, sections) =>
        set({
          user,
          isAuthenticated: true,
          isAdmin: user.role === 'Admin',
          sections: user.role === 'Admin'
            ? new Set<SectionKey>(AllSections)
            : new Set<SectionKey>(sections),
        }),

      logout: () =>
        set({ user: null, isAuthenticated: false, isAdmin: false, sections: new Set() }),

      canSee: (key) => {
        const { sections } = get()
        return sections.has(key)
      },
    }),
    {
      name: 'bizhub-auth',
      partialize: (s) => ({
        user: s.user,
        isAuthenticated: s.isAuthenticated,
        isAdmin: s.isAdmin,
        sections: Array.from(s.sections),
      }),
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray((state as unknown as { sections: SectionKey[] }).sections)) {
          state.sections = new Set((state as unknown as { sections: SectionKey[] }).sections)
        }
      },
    }
  )
)
