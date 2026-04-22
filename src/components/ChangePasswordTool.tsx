import { useState, type FormEvent } from 'react'
import { apiUrl } from '../lib/api'

type ChangePasswordToolProps = {
  currentUsername: string
}

export default function ChangePasswordTool({ currentUsername }: ChangePasswordToolProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const resetForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setSuccess(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!currentPassword.trim()) {
      setError('Informe sua senha atual.')
      return
    }

    if (!newPassword.trim()) {
      setError('Informe a nova senha.')
      return
    }

    if (!confirmPassword.trim()) {
      setError('Confirme a nova senha.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Nova senha e confirmacao nao conferem.')
      return
    }

    if (newPassword.length < 3) {
      setError('Nova senha deve ter no minimo 3 caracteres.')
      return
    }

    if (currentPassword === newPassword) {
      setError('Nova senha deve ser diferente da senha atual.')
      return
    }

    const payload = {
      currentPassword,
      newPassword,
      confirmPassword,
    }

    try {
      setIsSaving(true)
      const response = await fetch(apiUrl('/api/auth/change-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user': currentUsername.trim().toLowerCase(),
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = 'Falha ao alterar a senha.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await response.json() as { message?: string }
      setSuccess(data.message || 'Senha alterada com sucesso.')
      resetForm()
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Erro ao alterar a senha.'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="card">
      <h2>Alterar Senha</h2>
      <p className="muted" style={{ marginBottom: '1.5rem' }}>
        Digite sua senha atual e a nova senha que deseja utilizar.
      </p>

      <form className="estimativas-form" onSubmit={handleSubmit}>
        <label>
          Senha Atual *
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Digite sua senha atual"
            disabled={isSaving}
          />
        </label>

        <label>
          Nova Senha *
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Digite a nova senha"
            disabled={isSaving}
          />
        </label>

        <label>
          Confirmar Nova Senha *
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirme a nova senha"
            disabled={isSaving}
          />
        </label>

        <div className="estimativas-actions">
          <button type="submit" className="button-primary" disabled={isSaving}>
            {isSaving ? 'Alterando...' : 'Alterar Senha'}
          </button>
          <button type="button" className="button-secondary" onClick={resetForm} disabled={isSaving}>
            Cancelar
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </form>
    </section>
  )
}
