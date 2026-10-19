import { fireEvent, render, screen } from '@testing-library/react'
import { Portrait } from '@/components/ui/Portrait'
import { MediaImage } from '@/components/ui/MediaImage'
import type { Person } from '@/family/model'

const person = (url: string | null): Person => ({
  id: 'p1',
  name: 'Erika Beispiel',
  gender: 'FEMALE',
  spouseId: null,
  parentIds: [],
  childrenIds: [],
  adoptedChildrenIds: [],
  profile: { titleImageUrl: url, media: [] },
})

describe('Fehlende Bilder', () => {
  it('Portrait zeigt die Initialen, wenn die Datei fehlt', () => {
    const { container } = render(<Portrait person={person('https://example.org/weg.jpg')} />)
    const img = container.querySelector('img')!
    expect(img).toBeInTheDocument()
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('EB')
  })

  it('Foto in der Sammlung zeigt „Bild fehlt“', () => {
    const { container } = render(<MediaImage src="https://example.org/weg.jpg" alt="Hochzeit" />)
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByText('Bild fehlt')).toBeInTheDocument()
  })
})
