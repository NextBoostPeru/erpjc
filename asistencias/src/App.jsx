import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'

function normalizeApiBase(raw) {
  const v = String(raw || '').trim()
  if (!v) return 'https://jc.nextboostperu.com/api/'
  return v.endsWith('/') ? v : `${v}/`
}

function getDeviceId() {
  const key = 'asistencias_device_id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).toString()
  localStorage.setItem(key, id)
  return id
}

function formatDateTime(d) {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d)
  } catch {
    return d.toLocaleString()
  }
}

function App() {
  const API_BASE = useMemo(() => normalizeApiBase(import.meta.env.VITE_API_URL), [])
  const KIOSK_KEY = String(import.meta.env.VITE_KIOSK_KEY || '').trim()

  const [dni, setDni] = useState('')
  const [colaborador, setColaborador] = useState(null)
  const [geo, setGeo] = useState({ status: 'idle', lat: null, lng: null, accuracy: null, error: '' })
  const [loading, setLoading] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [modal, setModal] = useState(null)
  const [shake, setShake] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const dniInputRef = useRef(null)
  const lookupTimerRef = useRef(null)
  const modalTimerRef = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const closeModal = () => {
    if (modalTimerRef.current) {
      clearTimeout(modalTimerRef.current)
      modalTimerRef.current = null
    }
    setModal(null)
  }

  const openModal = (next, opts = {}) => {
    if (modalTimerRef.current) {
      clearTimeout(modalTimerRef.current)
      modalTimerRef.current = null
    }
    setModal(next)
    const ms = Number(opts.autoCloseMs || 0)
    if (ms > 0) {
      modalTimerRef.current = setTimeout(() => {
        modalTimerRef.current = null
        setModal(null)
      }, ms)
    }
  }

  const api = useMemo(() => {
    return axios.create({
      baseURL: API_BASE,
      timeout: 15000,
      headers: KIOSK_KEY ? { 'X-Kiosk-Key': KIOSK_KEY } : {},
    })
  }, [API_BASE, KIOSK_KEY])

  const requestLocation = async () => {
    setGeo({ status: 'loading', lat: null, lng: null, accuracy: null, error: '' })
    if (!navigator.geolocation) {
      setGeo({ status: 'error', lat: null, lng: null, accuracy: null, error: 'Geolocalización no soportada.' })
      return null
    }
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = {
            status: 'ready',
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            error: '',
          }
          setGeo(next)
          resolve(next)
        },
        (err) => {
          const msg = err?.message || 'No se pudo obtener la ubicación.'
          setGeo({ status: 'error', lat: null, lng: null, accuracy: null, error: msg })
          resolve(null)
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        },
      )
    })
  }

  const handleBuscar = async () => {
    const doc = String(dni).trim()
    if (!/^\d{8}$/.test(doc)) {
      setColaborador(null)
      setResult({ ok: false, message: 'Ingrese un DNI válido (8 dígitos).' })
      return
    }
    setLoading(true)
    setLookupLoading(false)
    setResult(null)
    try {
      const res = await api.get(`asistencias.php`, { params: { kiosk: '1', action: 'lookup', dni: doc } })
      const c = res.data?.colaborador || null
      setColaborador(c)
      if (!c) {
        setResult({ ok: false, message: 'Colaborador no encontrado.' })
      }
      return c
    } catch (e) {
      const status = e?.response?.status
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Error al buscar.'
      setColaborador(null)
      setResult({ ok: false, message: status ? `(${status}) ${msg}` : msg })
      return null
    } finally {
      setLoading(false)
    }
  }

  const scheduleLookup = (nextDni) => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current)
    const doc = String(nextDni || '').trim()
    if (!/^\d{8}$/.test(doc)) {
      setColaborador(null)
      setLookupLoading(false)
      return
    }
    setLookupLoading(true)
    lookupTimerRef.current = setTimeout(async () => {
      if (loading) {
        setLookupLoading(false)
        return
      }
      try {
        const res = await api.get(`asistencias.php`, { params: { kiosk: '1', action: 'lookup', dni: doc } })
        const c = res.data?.colaborador || null
        setColaborador(c)
      } catch {
        setColaborador(null)
      } finally {
        setLookupLoading(false)
      }
    }, 250)
  }

  const handleMarcar = async () => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current)
    setLookupLoading(false)
    const doc = String(dni).trim()
    if (!/^\d{8}$/.test(doc)) {
      const msg = 'Ingrese un DNI válido (8 dígitos).'
      setResult({ ok: false, message: msg })
      openModal({ ok: false, title: 'Validación', subtitle: msg })
      setShake(true)
      setTimeout(() => setShake(false), 350)
      return
    }
    let colab = colaborador
    if (!colab) colab = await handleBuscar()
    if (!colab) {
      if (result?.ok === false && result?.message) {
        openModal({ ok: false, title: 'No se pudo marcar', subtitle: result.message })
      } else {
        openModal({ ok: false, title: 'No se pudo marcar', subtitle: 'Colaborador no encontrado.' })
      }
      setShake(true)
      setTimeout(() => setShake(false), 350)
      return
    }

    setLoading(true)
    setResult(null)
    try {
      const loc = await requestLocation()
      if (!loc) {
        openModal({ ok: false, title: 'Ubicación requerida', subtitle: geo.error || 'No se pudo obtener la ubicación.' })
        setLoading(false)
        setShake(true)
        setTimeout(() => setShake(false), 350)
        return
      }
      const deviceId = getDeviceId()
      const res = await api.post(`asistencias.php`, {
        dni: doc,
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
        device_id: deviceId,
      }, {
        headers: { 'Content-Type': 'application/json' },
        params: { kiosk: '1', action: 'marcar' },
      })
      const tipo = res.data?.tipo || ''
      const when = res.data?.fecha && res.data?.hora ? `${res.data.fecha} ${res.data.hora}` : ''
      const msg = res.data?.message || 'Marcación registrada.'
      setResult({ ok: true, message: msg })
      openModal({
        ok: true,
        title: tipo ? `${tipo} registrada` : 'Marcación registrada',
        subtitle: when || msg,
      }, { autoCloseMs: 2500 })
      setDni('')
      setColaborador(null)
      setGeo({ status: 'idle', lat: null, lng: null, accuracy: null, error: '' })
      setResult((prev) => ({ ...(prev || {}), data: res.data || null }))
      setTimeout(() => {
        dniInputRef.current?.focus?.()
      }, 50)
    } catch (e) {
      const status = e?.response?.status
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Error al marcar.'
      const full = status ? `(${status}) ${msg}` : msg
      setResult({ ok: false, message: full })
      openModal({ ok: false, title: 'No se pudo marcar', subtitle: full })
      setShake(true)
      setTimeout(() => setShake(false), 350)
    } finally {
      setLoading(false)
    }
  }

  const dniValid = /^\d{8}$/.test(String(dni).trim())
  const dniTouched = String(dni || '').length > 0
  const dniInputClassName = [
    'mt-1 w-full rounded-xl border bg-slate-50 px-4 py-4 text-xl tracking-[0.25em] outline-none focus:ring-2',
    dniTouched && !dniValid
      ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
      : dniValid
        ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-200'
        : 'border-slate-200 focus:border-blue-500 focus:ring-blue-200',
  ].join(' ')

  return (
    <div className="min-h-screen bg-slate-100">
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 px-4">
          <div className="kiosk-pop-in w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-slate-900">{modal.ok ? 'Confirmación' : 'Validación'}</div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mt-4">
              {modal.ok ? (
                <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50">
                  <div className="kiosk-pulse-ring absolute inset-0 rounded-full" />
                  <svg className="kiosk-check h-8 w-8" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ) : (
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-50">
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none">
                    <path d="M6 6l12 12M18 6L6 18" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </div>
              )}

              <div className="mt-3 text-center">
                <div className="text-lg font-extrabold text-slate-900">{modal.title}</div>
                {modal.subtitle ? <div className="mt-1 text-sm text-slate-600">{modal.subtitle}</div> : null}
              </div>

              {modal.ok ? (
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="kiosk-confirm-progress h-full bg-emerald-500" />
                </div>
              ) : null}

              <button
                type="button"
                onClick={closeModal}
                className={`mt-5 w-full rounded-xl px-4 py-3 text-sm font-extrabold text-white ${
                  modal.ok ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 ${shake ? 'kiosk-shake' : ''}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Marcador de Asistencias</h1>
              <p className="mt-1 text-sm text-slate-600">Ingrese su DNI y presione “Marcar” para entrada/salida.</p>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-500">Hora</div>
              <div className="text-sm font-bold text-slate-900">{formatDateTime(clock)}</div>
              <div className="mt-1 text-xs text-slate-500">{navigator.onLine ? 'Conectado' : 'Sin conexión'}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">DNI</label>
              <input
                ref={dniInputRef}
                value={dni}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, '').slice(0, 8)
                  setDni(v)
                  scheduleLookup(v)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleMarcar()
                }}
                inputMode="numeric"
                className={dniInputClassName}
                placeholder="DNI (8 dígitos)"
                disabled={loading}
                autoFocus
              />
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span className="min-h-4">
                  {colaborador ? (
                    <span className="kiosk-fade-up inline-flex items-center gap-2">
                      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      {colaborador.nombres} {colaborador.apellidos}
                    </span>
                  ) : lookupLoading && dniValid ? (
                    <span className="kiosk-fade-up inline-flex items-center gap-2 text-slate-500">
                      <svg className="kiosk-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Buscando...
                    </span>
                  ) : (
                    ' '
                  )}
                </span>
                <span className="font-medium">{dni.length === 8 ? 'Listo' : 'Ingrese 8 dígitos'}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleMarcar}
              disabled={loading || !dniValid}
              className="mt-2 inline-flex w-full items-center justify-center gap-3 rounded-xl bg-blue-600 px-4 py-4 text-lg font-extrabold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <svg className="kiosk-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Procesando...
                </>
              ) : (
                'Marcar'
              )}
            </button>

            <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Ubicación</span>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  onClick={requestLocation}
                  disabled={loading}
                >
                  Actualizar
                </button>
              </div>
              {geo.status === 'idle' && <div className="mt-1 text-xs text-slate-500">Aún no solicitada.</div>}
              {geo.status === 'loading' && <div className="mt-1 text-xs text-slate-500">Obteniendo ubicación...</div>}
              {geo.status === 'error' && <div className="mt-1 text-xs text-red-600">{geo.error}</div>}
              {geo.status === 'ready' && (
                <div className="mt-1 text-xs text-slate-600">
                  Lat: {geo.lat?.toFixed(6)} | Lng: {geo.lng?.toFixed(6)} | Precisión: {Math.round(geo.accuracy || 0)} m
                </div>
              )}
            </div>

            {result && (
              <div
                className={`rounded-xl p-3 text-sm font-semibold ${
                  result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}
              >
                {result.message}
                {result?.data?.tipo && (
                  <div className="mt-1 text-xs font-medium">
                    {result.data.tipo} | {result.data.fecha} {result.data.hora}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-slate-500">
          Este módulo registra en el ERP: fecha, hora, estado, ubicación y DNI del colaborador.
          <div className="mt-1">API: {API_BASE}</div>
        </div>
      </div>
    </div>
  )
}

export default App
