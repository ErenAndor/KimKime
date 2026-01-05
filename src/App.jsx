import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { Users, Lock, LogIn, Plus, Play, Sparkles, Search, ArrowRight, UserMinus, ShieldCheck, Trash2, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import './index.css';

const socket = io(import.meta.env.PROD ? undefined : 'http://localhost:3001');

function App() {
  const [view, setView] = useState('landing'); // landing, lobby, raffling, result, system_admin
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRaffle, setSelectedRaffle] = useState(null);

  const [raffleData, setRaffleData] = useState(null);
  const [name, setName] = useState('');
  const [raffleId, setRaffleId] = useState('');
  const [password, setPassword] = useState('');
  const [participants, setParticipants] = useState([]);
  const [adminId, setAdminId] = useState(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // System Admin State
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminRaffles, setAdminRaffles] = useState([]);

  useEffect(() => {
    socket.on('raffle_created', (data) => {
      setRaffleData(data);
      setParticipants(data.participants);
      setAdminId(data.adminId);
      setView('lobby');
      setShowCreateModal(false);
    });

    socket.on('raffle_joined', (data) => {
      setRaffleData(data);
      setParticipants(data.participants);
      setAdminId(data.adminId);
      setView('lobby');
      setSelectedRaffle(null);
    });

    socket.on('update_participants', (list) => {
      setParticipants(list);
    });

    socket.on('kicked', (msg) => {
      setView('landing');
      setRaffleData(null);
      setError(msg);
      setTimeout(() => setError(''), 5000);
    });

    socket.on('search_results', (results) => {
      setSearchResults(results);
    });

    socket.on('raffle_started', () => {
      setView('raffling');
    });

    socket.on('raffle_result', (data) => {
      setResult(data.targetName);
      setTimeout(() => {
        setView('result');
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#6366f1', '#a855f7', '#ffffff']
        });
      }, 5000);
    });

    socket.on('system_admin_authenticated', (list) => {
      setAdminRaffles(list);
      setView('system_admin');
    });

    socket.on('system_admin_action_success', (msg) => {
      // Refresh list
      socket.emit('system_admin_login', searchQuery);
    });

    socket.on('error', (msg) => {
      setError(msg);
      // Clear specific errors after delay
      if (msg.includes('Limit') || msg.includes('anahtarı')) {
        setTimeout(() => setError(''), 4000);
      }
    });

    // Initial search
    socket.emit('search_raffles', '');

    return () => {
      socket.off('raffle_created');
      socket.off('raffle_joined');
      socket.off('update_participants');
      socket.off('kicked');
      socket.off('search_results');
      socket.off('raffle_started');
      socket.off('raffle_result');
      socket.off('system_admin_authenticated');
      socket.off('system_admin_action_success');
      socket.off('error');
    };
  }, [searchQuery]);

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    socket.emit('search_raffles', q);
  };

  const handleCreateRaffle = () => {
    if (!name || !raffleId || !password) return;
    socket.emit('create_raffle', { raffleId, password, adminName: name });
  };

  const handleJoinRaffle = () => {
    if (!name || !password || !selectedRaffle) return;
    socket.emit('join_raffle', { raffleId: selectedRaffle.raffleId, password, participantName: name });
  };

  const startRaffle = () => {
    socket.emit('start_raffle', raffleData.raffleId);
  };

  const handleKick = (participantId) => {
    socket.emit('kick_participant', { raffleId: raffleData.raffleId, participantId });
  };

  const handleAdminLogin = () => {
    socket.emit('system_admin_login', searchQuery);
  };

  const handleDeleteRaffle = (rid) => {
    socket.emit('system_admin_delete', rid);
  };

  if (view === 'landing') {
    return (
      <div className="landing-container">
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <h1 style={{ marginBottom: 0 }}>KimKime</h1>
            {searchQuery === 'admin123' && (
              <button className="admin-trigger" onClick={handleAdminLogin} title="Sistem Yöneticisi Girişi">
                <ShieldCheck size={24} color="var(--primary)" />
              </button>
            )}
          </div>
          <p style={{ color: 'var(--text-muted)' }}>Hediyeleşmeleriniz için şık ve hızlı çekiliş.</p>
        </div>

        <div className="discovery-area">
          <div className="search-box">
            <Search size={20} className="search-icon" />
            <input
              placeholder="Çekiliş ara..."
              value={searchQuery}
              onChange={handleSearch}
              className="search-input"
            />
            <button className="create-btn" onClick={() => setShowCreateModal(true)}>
              <Plus size={18} />
              Yeni Çekiliş
            </button>
          </div>

          <div className="room-results">
            {searchResults.length > 0 ? (
              searchResults.map(r => (
                <div key={r.raffleId} className="room-card" onClick={() => { setSelectedRaffle(r); setError(''); }}>
                  <div>
                    <h3>{r.raffleId}</h3>
                    <p>{r.participantCount} Katılımcı</p>
                  </div>
                  <ArrowRight size={20} className="arrow" />
                </div>
              ))
            ) : (
              <div className="no-rooms">
                {searchQuery ? 'Eşleşen çekiliş bulunamadı.' : 'Henüz çekiliş yok... İlkini sen kur!'}
              </div>
            )}
          </div>
          {error && <p className="error-text" style={{ marginTop: '1rem' }}>{error}</p>}
        </div>

        {/* Create Raffle Modal */}
        {showCreateModal && (
          <div className="modal-overlay">
            <div className="glass-card modal-content">
              <h2>Yeni Çekiliş Oluştur</h2>
              <input placeholder="Sizin İsminiz" value={name} onChange={e => setName(e.target.value)} />
              <input placeholder="Çekiliş İsmi" value={raffleId} onChange={e => setRaffleId(e.target.value)} />
              <input type="password" placeholder="Şifre" value={password} onChange={e => setPassword(e.target.value)} />
              <div className="modal-actions">
                <button className="secondary" onClick={() => setShowCreateModal(false)}>İptal</button>
                <button onClick={handleCreateRaffle}>Oluştur</button>
              </div>
              {error && <p className="error-text">{error}</p>}
            </div>
          </div>
        )}

        {/* Join Raffle Modal */}
        {selectedRaffle && (
          <div className="modal-overlay">
            <div className="glass-card modal-content">
              <h2>"{selectedRaffle.raffleId}" Çekilişine Katıl</h2>
              <input placeholder="Sizin İsminiz" value={name} onChange={e => setName(e.target.value)} />
              <input type="password" placeholder="Şifre" value={password} onChange={e => setPassword(e.target.value)} />
              <div className="modal-actions">
                <button className="secondary" onClick={() => { setSelectedRaffle(null); setError(''); }}>İptal</button>
                <button onClick={handleJoinRaffle}>Katıl</button>
              </div>
              {error && <p className="error-text">{error}</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'system_admin') {
    return (
      <div className="glass-card" style={{ maxWidth: '800px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2>Sistem Yönetici Paneli</h2>
          <button className="secondary" onClick={() => setView('landing')}><X size={18} /></button>
        </div>
        <div className="admin-list">
          {adminRaffles.length > 0 ? (
            adminRaffles.map(r => (
              <div key={r.raffleId} className="admin-item">
                <div>
                  <strong>{r.raffleId}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {r.participantCount} Kişi | Durum: {r.status}
                  </div>
                </div>
                <button className="kick-btn" onClick={() => handleDeleteRaffle(r.raffleId)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <div className="no-rooms">Sistemde aktif çekiliş yok.</div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'lobby') {
    const isAdmin = socket.id === adminId;
    return (
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Çekiliş: {raffleData.raffleId}</h2>
            <p style={{ color: 'var(--text-muted)' }}>Katılımcılar bekleniyor...</p>
          </div>
          <div className="badge">
            <Users size={14} style={{ marginRight: '4px' }} />
            {participants.length} / 100
          </div>
        </div>

        <div className="room-list">
          {participants.map((p) => (
            <div key={p.id} className="room-item">
              <span>{p.name} {p.id === socket.id && <small style={{ color: 'var(--primary)' }}>(Siz)</small>}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {p.id === adminId && <span className="badge">Yönetici</span>}
                {isAdmin && p.id !== socket.id && (
                  <button
                    onClick={() => handleKick(p.id)}
                    className="kick-btn"
                    title="Çıkar"
                  >
                    <UserMinus size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          {isAdmin ? (
            <button
              onClick={startRaffle}
              disabled={participants.length < 2}
              style={{ width: '100%', maxWidth: '300px' }}
            >
              <Play size={18} style={{ marginRight: '8px' }} />
              Çekilişi Başlat
            </button>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Yöneticinin çekilişi başlatması bekleniyor...</p>
          )}
          {participants.length < 2 && isAdmin && (
            <p style={{ color: '#ef4444', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              En az 2 kişi katılmalı.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (view === 'raffling') {
    return (
      <div className="animation-container">
        <div className="raffle-loader">
          <Sparkles className="spinning-icon" size={64} color="var(--primary)" />
          <h2 style={{ marginTop: '2rem' }}>Torba Karıştırılıyor...</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Bakalım sana kim çıkacak?</p>
        </div>
        <style>{`
          .spinning-icon {
            animation: spin 2s linear infinite, glow 1.5s ease-in-out infinite alternate;
          }
          @keyframes spin { 100% { transform: rotate(360deg); } }
          @keyframes glow { 
            from { filter: drop-shadow(0 0 5px var(--primary)); }
            to { filter: drop-shadow(0 0 20px var(--primary)); }
          }
        `}</style>
      </div>
    );
  }

  if (view === 'result') {
    return (
      <div className="glass-card result-card" style={{ maxWidth: '500px', margin: 'auto' }}>
        <h1 style={{ fontSize: '2rem' }}>Çekiliş Tamamlandı!</h1>
        <div style={{ margin: '3rem 0' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '1rem' }}>Şanslı isim:</p>
          <div style={{
            fontSize: '3.5rem',
            fontWeight: '900',
            color: 'white',
            textShadow: '0 0 20px rgba(99, 102, 241, 0.5)'
          }}>
            {result}
          </div>
        </div>
        <button onClick={() => window.location.reload()}>Anasayfaya Dön</button>
      </div>
    );
  }

  return null;
}

export default App;
