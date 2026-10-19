import { fireEvent, render, screen } from '@testing-library/react'
import { Portrait } from '@/components/ui/Portrait'
import { MediaImage } from '@/components/ui/MediaImage'
import type { Person } from '@/family/model'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/locales'

const inLocale = (locale: Locale, ui: React.ReactElement) => render(<I18nProvider initial={locale}>{ui}</I18nProvider>)

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

describe('missing images', () => {
  it('Portrait shows initials when the file is missing', () => {
    const { container } = render(<Portrait person={person('https://example.org/weg.jpg')} />)
    const img = container.querySelector('img')!
    expect(img).toBeInTheDocument()
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('EB')
  })

  it.each([
    ['de', 'Bild fehlt'],
    ['en', 'Image missing'],
  ] as const)('a photo in the collection shows a notice (%s)', (locale, notice) => {
    const { container } = inLocale(locale, <MediaImage src="https://example.org/weg.jpg" alt="Hochzeit" />)
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByText(notice)).toBeInTheDocument()
  })
})
