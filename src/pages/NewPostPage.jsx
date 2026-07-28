import { useMemo, useState } from 'react';
import { ArrowLeft, ImagePlus, Link2, MapPin, Send, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../context/AuthContext';

const getAvatar = (user, profile) => profile?.avatar_url || `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(user?.email || 'coffee-user')}`;

function NewPostPage() {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const [text, setText] = useState('');
  const [posted, setPosted] = useState(false);
  const avatar = useMemo(() => getAvatar(user, userProfile), [user, userProfile]);
  const username = userProfile?.username || user?.email?.split('@')[0] || 'coffee lover';

  const publishPost = () => {
    const content = text.trim();
    if (!content) return;

    const post = { id: Date.now(), content, username, avatar, createdAt: new Date().toISOString() };
    const currentPosts = JSON.parse(window.localStorage.getItem('coffee-map:posts') || '[]');
    window.localStorage.setItem('coffee-map:posts', JSON.stringify([post, ...currentPosts].slice(0, 20)));
    setText('');
    setPosted(true);
  };

  return (
    <main className="social-page new-post-page">
      <div className="social-shell new-post-shell">
        <header className="social-topbar">
          <button type="button" aria-label="Cerrar" onClick={() => navigate(-1)}><X size={19} /></button>
          <span>New Post</span>
          <button type="button" className="social-post-button" disabled={!text.trim()} onClick={publishPost}>Postear</button>
        </header>

        {posted && <p className="post-success">Tu publicación se guardó en tu actividad.</p>}

        <section className="new-post-composer">
          <div className="new-post-actions">
            <button type="button" onClick={() => navigate(-1)}>Cancelar</button>
            <span>Borradores</span>
          </div>
          <div className="new-post-author">
            <img src={avatar} alt="" />
            <strong>{username}</strong>
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="¿Qué quieres registrar hoy?"
            maxLength={500}
            autoFocus
          />
          <div className="new-post-toolbar">
            <button type="button" aria-label="Agregar imagen"><ImagePlus size={19} /></button>
            <button type="button" aria-label="Agregar ubicación"><MapPin size={18} /></button>
            <button type="button" aria-label="Agregar enlace"><Link2 size={18} /></button>
            <span>{text.length}/500</span>
          </div>
        </section>
      </div>
      <BottomNav />
    </main>
  );
}

export default NewPostPage;
