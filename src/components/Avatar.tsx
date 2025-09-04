// src/components/Avatar.tsx
interface AvatarProps {
  color?: string
  imageUrl?: string
  onClick?: () => void
  title?: string
  isDescendant?: boolean
}

export default function Avatar({
  color = 'bg-gray-200',
  imageUrl,
  onClick,
  title,
  isDescendant = true,
}: AvatarProps) {
  // ersten Buchstaben aus dem Titel oder Fallback "?"
  const initial = title?.trim()?.charAt(0).toUpperCase() ?? '?'

  return (
    <div
      onClick={onClick}
      title={title}
      className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer overflow-hidden
        ${imageUrl ? '' : color}
        ring-2 ring-[color:var(--color-primary-800)]`}  
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-white font-bold text-sm">{initial}</span>
      )}
    </div>
  )
}
