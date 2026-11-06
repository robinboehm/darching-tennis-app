import { useEffect, useState } from 'react'

export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/')
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.slice(1) || '/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash.split('/').filter(Boolean)
}

export const navigate = (path: string) => {
  window.location.hash = path
}
