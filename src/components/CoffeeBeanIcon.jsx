function CoffeeBeanIcon({ size = 18, className = '', filled = false, strokeWidth = 1.8, title, style }) {
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d="M17.9 3.8C14.7 1.3 9.2 2.1 5.7 5.6c-3.8 3.8-4.1 9.6-.7 13 3.4 3.4 9.2 3.1 13-.7 3.5-3.5 4.4-9 .7-12.1Z" />
      <path d="M7.1 17.8c2.6-1.8 4.5-4.4 5.1-7.2.5-2.2.2-4.3-.5-6.1" />
    </svg>
  );
}

export default CoffeeBeanIcon;
