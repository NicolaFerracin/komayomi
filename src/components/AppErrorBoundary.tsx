import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

export class AppErrorBoundary extends Component<{children:ReactNode},{error:Error|null}> {
  state:{error:Error|null}={error:null}
  static getDerivedStateFromError(error:Error){return {error}}
  componentDidCatch(error:Error,info:ErrorInfo){console.error('KomaYomi render failure',error,info)}
  render(){if(!this.state.error)return this.props.children;return <main className="fatal-error"><AlertTriangle size={36}/><span>READER RECOVERY</span><h1>This page contained data KomaYomi could not render.</h1><p>Your library and corrections are safe. Reload the interface; if this page fails again, its OCR metadata needs repair.</p><details><summary>Technical detail</summary><pre>{this.state.error.message}</pre></details><button className="primary-button" onClick={()=>window.location.reload()}><RotateCw size={16}/> Reload KomaYomi</button></main>}
}
