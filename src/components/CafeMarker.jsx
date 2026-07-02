import { useEffect, useRef } from 'react'

function CafeMarker({ map, markerLib, position, title, link, imageUrl, markerColor = '#4B2C20', onClick }) {
  const onClickRef = useRef(onClick)

  useEffect(() => {
    onClickRef.current = onClick
  }, [onClick])

  useEffect(() => {
    if (!map || !markerLib) {
      return
    }

    const { AdvancedMarkerElement } = markerLib

    const markerRoot = document.createElement('div')
    markerRoot.className = 'relative h-px w-px'

    const morph = document.createElement('div')
    morph.className =
      'absolute bottom-0 left-1/2 h-5 w-5 -translate-x-1/2 -translate-y-full rounded-[10px] border-2 bg-[var(--marker-color)] shadow-[0_4px_10px_rgba(0,0,0,0.3)] transition-[width,height,transform,box-shadow] duration-1000 ease-out'
    morph.style.borderColor = markerColor
    morph.style.setProperty('--marker-color', markerColor)
    morph.style.backgroundColor = markerColor
    morph.style.backgroundImage = 'none'

    const overlay = document.createElement('div')
    overlay.className =
      'absolute inset-0 bg-gradient-to-t from-black/75 to-black/10 opacity-0 transition-opacity duration-1000 ease-out'
    overlay.style.borderRadius = 'inherit'

    const markerText = document.createElement('span')
    markerText.className =
      'absolute bottom-1.5 left-2 right-2 z-[1] truncate text-[11px] leading-[1.2] font-semibold text-white opacity-0 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)] transition-opacity duration-1000 ease-out'
    markerText.textContent = title

    const centerDot = document.createElement('div')
    centerDot.className =
      'absolute left-1/2 top-1/2 z-[2] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-100 transition-opacity duration-300 ease-out'

    const pointer = document.createElement('div')
    pointer.className =
      'absolute bottom-[-11px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[11px] border-x-transparent'
    pointer.style.borderTopColor = markerColor

    morph.appendChild(overlay)
    morph.appendChild(markerText)
    morph.appendChild(centerDot)
    morph.appendChild(pointer)

    markerRoot.appendChild(morph)

    let isHovered = false
    let isAnimating = false
    let animationTimeoutId = null

    const setExpandedStyles = () => {
      morph.classList.add('w-40', 'h-[90px]', '-translate-y-[calc(100%+6px)]', 'shadow-[0_10px_20px_rgba(0,0,0,0.38)]')
      morph.classList.remove('h-5', 'w-5', '-translate-y-full', 'shadow-[0_4px_10px_rgba(0,0,0,0.3)]')
      overlay.classList.remove('opacity-0')
      markerText.classList.remove('opacity-0')
      centerDot.classList.add('opacity-0')
      centerDot.classList.remove('opacity-100')
      pointer.classList.add('bottom-[-17px]')
      pointer.classList.remove('bottom-[-11px]')

      if (imageUrl) {
        morph.style.backgroundImage = `url(${imageUrl})`
        morph.style.backgroundSize = 'cover'
        morph.style.backgroundPosition = 'center'
      } else {
        morph.style.backgroundImage = 'none'
        morph.style.backgroundColor = markerColor
      }
    }

    const setCollapsedStyles = () => {
      morph.classList.add('h-5', 'w-5', '-translate-y-full', 'shadow-[0_4px_10px_rgba(0,0,0,0.3)]')
      morph.classList.remove(
        'w-40',
        'h-[90px]',
        '-translate-y-[calc(100%+6px)]',
        'shadow-[0_10px_20px_rgba(0,0,0,0.38)]',
      )
      overlay.classList.add('opacity-0')
      markerText.classList.add('opacity-0')
      centerDot.classList.add('opacity-100')
      centerDot.classList.remove('opacity-0')
      pointer.classList.add('bottom-[-11px]')
      pointer.classList.remove('bottom-[-17px]')
      morph.style.backgroundImage = 'none'
      morph.style.backgroundColor = markerColor
    }

    let marker = null
    let mapClickListener = null

    const removeMapClickListener = () => {
      if (mapClickListener) {
        window.google.maps.event.removeListener(mapClickListener)
        mapClickListener = null
      }
    }

    const forceCollapse = () => {
      isHovered = false
      isAnimating = false
      removeMapClickListener()
      if (animationTimeoutId !== null) {
        window.clearTimeout(animationTimeoutId)
        animationTimeoutId = null
      }
      markerRoot.classList.remove('cafe-marker--expanded', 'cafe-marker--animating')
      if (marker) marker.zIndex = null
      setCollapsedStyles()
    }

    const handleCloseOthers = (e) => {
      if (e.detail !== markerRoot && markerRoot.classList.contains('cafe-marker--expanded')) {
        forceCollapse()
      }
    }
    window.addEventListener('close-other-markers', handleCloseOthers)

    const startExpandAnimation = () => {
      if (isAnimating || markerRoot.classList.contains('cafe-marker--expanded')) {
        return
      }

      window.dispatchEvent(new CustomEvent('close-other-markers', { detail: markerRoot }))

      isAnimating = true
      markerRoot.classList.add('cafe-marker--expanded', 'cafe-marker--animating')
      if (marker) marker.zIndex = 10
      setExpandedStyles()

      animationTimeoutId = window.setTimeout(() => {
        isAnimating = false
        markerRoot.classList.remove('cafe-marker--animating')

        if (!isHovered) {
          markerRoot.classList.remove('cafe-marker--expanded')
          if (marker) marker.zIndex = null
          setCollapsedStyles()
        }
      }, 1000)
    }

    const handleMouseEnter = () => {
      isHovered = true
      startExpandAnimation()
    }

    const handleMouseLeave = () => {
      isHovered = false

      if (!isAnimating) {
        markerRoot.classList.remove('cafe-marker--expanded')
        if (marker) marker.zIndex = null
        setCollapsedStyles()
      }
    }

    markerRoot.addEventListener('mouseenter', handleMouseEnter)
    markerRoot.addEventListener('mouseleave', handleMouseLeave)

    marker = new AdvancedMarkerElement({
      map,
      position,
      title,
      content: markerRoot,
      gmpClickable: true,
    })

    const handleMarkerClick = () => {
      if (!markerRoot.classList.contains('cafe-marker--expanded')) {
        isHovered = true
        startExpandAnimation()

        removeMapClickListener()
        mapClickListener = map.addListener('click', () => {
          isHovered = false
          if (!isAnimating) {
            markerRoot.classList.remove('cafe-marker--expanded')
            if (marker) marker.zIndex = null
            setCollapsedStyles()
          }
          removeMapClickListener()
        })
      } else {
        removeMapClickListener()
        if (onClickRef.current) {
          onClickRef.current()
        } else if (typeof link === 'string' && link.length > 0) {
          window.open(link, '_blank', 'noopener,noreferrer')
        }
      }
    }

    marker.addEventListener('gmp-click', handleMarkerClick)

    return () => {
      window.removeEventListener('close-other-markers', handleCloseOthers)
      markerRoot.removeEventListener('mouseenter', handleMouseEnter)
      markerRoot.removeEventListener('mouseleave', handleMouseLeave)
      marker.removeEventListener('gmp-click', handleMarkerClick)
      removeMapClickListener()
      if (animationTimeoutId !== null) {
        window.clearTimeout(animationTimeoutId)
      }
      marker.map = null
    }
  }, [map, markerLib, position, title, link, imageUrl, markerColor])

  return null
}

export default CafeMarker
