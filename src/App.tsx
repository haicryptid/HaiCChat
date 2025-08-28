import { useState, useEffect } from 'react'
import { database } from './firebase'
import { ref, push, onValue, remove, set, get } from 'firebase/database'
import './App.css'

interface Bubble {
  firebaseId?: string;
  id: number;
  text: string;
  color: string;
  user: string;
  x: number;
  timestamp: number;
  isPopping: boolean;
}

interface ActiveUser {
  user: string;
  color: string;
  timestamp: number;
  sessionId: string;
}

type UserKey = 'user1' | 'user2' | 'user3' | 'user4' | 'user5';

function App() {
  const [message, setMessage] = useState('')
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [currentUser, setCurrentUser] = useState<string>('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authCode, setAuthCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [activeUsers, setActiveUsers] = useState<Record<string, ActiveUser>>({})
  const [sessionId] = useState(() => 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9))
  
  // 새로 추가된 방 시스템 상태들
  const [roomId, setRoomId] = useState<string>('')
  const [mode, setMode] = useState<'' | 'create' | 'join'>('')

  // 페이지 타이틀 변경
  useEffect(() => {
    document.title = 'HaiCChat';
  }, []);

  const userColors: Record<UserKey, string> = {
    user1: 'pink',
    user2: 'blue',
    user3: 'green',
    user4: 'purple',
    user5: 'yellow'
  }

  // Firebase에서 실시간 데이터 감지 (방별로 분리)
  useEffect(() => {
    if (!isAuthenticated || !roomId) return;

    const bubblesRef = ref(database, `rooms/${roomId}/bubbles`);

    const unsubscribe = onValue(bubblesRef, (snapshot) => {
      console.log('Firebase 데이터 수신:', snapshot.val());
      const data = snapshot.val();
      if (data) {
        const bubbleArray = Object.entries(data).map(([key, value]) => {
          console.log('Firebase key:', key, 'value:', value);
          return {
            firebaseId: key,
            ...(value as Omit<Bubble, 'firebaseId'>)
          };
        });
        console.log('변환된 배열:', bubbleArray);
        setBubbles(bubbleArray);
        console.log('setBubbles 호출 완료');
      } else {
        console.log('데이터 없음');
        setBubbles([]);
      }
    }, (error) => {
      console.error('Firebase 읽기 오류:', error);
    });

    console.log('현재 bubbles state:', bubbles);

    return () => unsubscribe();
  }, [isAuthenticated, roomId]);

  // 활성 사용자들 실시간 감지 (방별로 분리)
  useEffect(() => {
    if (!isAuthenticated || !roomId) return;

    const activeUsersRef = ref(database, `rooms/${roomId}/activeUsers`);
    
    const unsubscribe = onValue(activeUsersRef, (snapshot) => {
      const data = snapshot.val() || {};
      console.log('활성 사용자 데이터:', data);
      setActiveUsers(data);
    });

    return () => unsubscribe();
  }, [isAuthenticated, roomId]);

  // 페이지 떠날 때만 사용자 정보 제거 (색상 변경과 분리)
  useEffect(() => {
    if (!isAuthenticated || !currentUser || !roomId) return;

    const handleBeforeUnload = () => {
      // 실제 페이지를 떠날 때만 제거
      navigator.sendBeacon(
        `https://haicchat-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/${roomId}/activeUsers/${sessionId}.json`, 
        JSON.stringify(null)
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionId, roomId]);

  // 방 생성
  const handleCreateRoom = async () => {
    if (authCode.trim().length < 3) {
      setAuthError('방 이름은 3글자 이상이어야 합니다')
      return
    }

    const roomCodeUpper = authCode.toUpperCase();
    
    try {
      // 방이 이미 존재하는지 확인
      const roomRef = ref(database, `rooms/${roomCodeUpper}`);
      const snapshot = await get(roomRef);
      
      if (snapshot.exists()) {
        setAuthError('이미 존재하는 방 이름입니다. 다른 이름을 선택해주세요.')
        return;
      }

      // 새 방 생성 (초기 방 정보 설정)
      await set(ref(database, `rooms/${roomCodeUpper}/roomInfo`), {
        name: roomCodeUpper,
        createdAt: Date.now(),
        createdBy: sessionId
      });

      setRoomId(roomCodeUpper);
      setIsAuthenticated(true);
      setAuthError('');
      console.log('새 방 생성됨:', roomCodeUpper);
    } catch (error) {
      console.error('방 생성 실패:', error);
      setAuthError('방 생성에 실패했습니다. 다시 시도해주세요.');
    }
  }

  // 기존 방 입장
  const handleJoinRoom = async () => {
    if (!authCode.trim()) {
      setAuthError('방 이름을 입력해주세요')
      return
    }

    const roomCodeUpper = authCode.toUpperCase();
    
    try {
      // 방이 존재하는지 확인
      const roomRef = ref(database, `rooms/${roomCodeUpper}`);
      const snapshot = await get(roomRef);
      
      if (!snapshot.exists()) {
        setAuthError('존재하지 않는 방입니다. 방 이름을 확인해주세요.');
        return;
      }

      setRoomId(roomCodeUpper);
      setIsAuthenticated(true);
      setAuthError('');
      console.log('방 입장:', roomCodeUpper);
    } catch (error) {
      console.error('방 입장 실패:', error);
      setAuthError('방 입장에 실패했습니다. 다시 시도해주세요.');
    }
  }

  // 통합된 인증 처리
  const handleAuth = () => {
    setAuthError('');
    if (mode === 'create') {
      handleCreateRoom();
    } else if (mode === 'join') {
      handleJoinRoom();
    }
  }

  // 활성 사용자 등록 (방별로 분리)
  const setActiveUser = async (userId: string) => {
    try {
      setCurrentUser(userId);
      
      const userRef = ref(database, `rooms/${roomId}/activeUsers/${sessionId}`);
      const userData = {
        user: userId,
        color: userColors[userId as UserKey],
        timestamp: Date.now(),
        sessionId: sessionId
      };
      
      await set(userRef, userData);
      console.log(`사용자 ${userId} 활성화됨:`, userData);
    } catch (error) {
      console.error('활성 사용자 등록 실패:', error);
    }
  };

  // 로그아웃
  const handleLogout = async () => {
    // 로그아웃 시에만 명시적으로 제거
    try {
      if (roomId) {
        await remove(ref(database, `rooms/${roomId}/activeUsers/${sessionId}`));
      }
    } catch (error) {
      console.error('로그아웃 시 사용자 제거 실패:', error);
    }
    
    setIsAuthenticated(false);
    setAuthCode('');
    setBubbles([]);
    setCurrentUser('');
    setActiveUsers({});
    setRoomId('');
    setMode('');
  }

  // 사용자 변경 (방별로 분리)
  const handleUserChange = async (userId: string) => {
    const targetColor = userColors[userId as UserKey];
    
    // 현재 사용자와 같은 색상이면 무시
    if (currentUser === userId) {
      return;
    }
    
    // 다른 사람이 사용 중인 색상인지 확인
    const isColorTaken = Object.values(activeUsers).some((user: ActiveUser) => 
      user.color === targetColor && user.user !== currentUser
    );
    
    if (isColorTaken) {
      console.log(`${targetColor} 색상이 다른 사용자에 의해 사용 중`);
      return;
    }

    try {
      console.log(`색상 변경 시작: ${currentUser} → ${userId}`);
      
      // 로컬 상태 먼저 업데이트
      setCurrentUser(userId);
      
      // Firebase 업데이트 (방별로)
      const userRef = ref(database, `rooms/${roomId}/activeUsers/${sessionId}`);
      const userData = {
        user: userId,
        color: targetColor,
        timestamp: Date.now(),
        sessionId: sessionId
      };
      
      await set(userRef, userData);
      console.log('Firebase 업데이트 완료:', userData);
      
    } catch (error) {
      console.error('사용자 변경 실패:', error);
    }
  };

  // 색상이 사용 중인지 확인
  const isUserColorTaken = (color: string) => {
    return Object.values(activeUsers).some((user: ActiveUser) => user.color === color);
  };

  // Firebase에 메시지 보내기 (방별로 분리)
  const sendMessage = async () => {
    if (message.trim() && currentUser && roomId) {
      const newBubble: Omit<Bubble, 'firebaseId'> = {
        id: Date.now(),
        text: message,
        color: userColors[currentUser as UserKey],
        user: currentUser,
        x: Math.random() * 80 + 10,
        timestamp: Date.now(),
        isPopping: false
      }

      try {
        await push(ref(database, `rooms/${roomId}/bubbles`), newBubble);
        setMessage('');
      } catch (error) {
        console.error('메시지 전송 실패:', error);
      }
    }
  }

  const playPopSound = () => {
    const audioContext = new AudioContext();

    [500, 300].forEach((freq, index) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'triangle';
      oscillator.frequency.value = freq;

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime + index * 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.06 + index * 0.02);

      oscillator.start(audioContext.currentTime + index * 0.02);
      oscillator.stop(audioContext.currentTime + 0.06 + index * 0.02);
    });
  }

  // Firebase에서 비눗방울 삭제 (방별로 분리)
  const popBubble = async (bubble: Bubble) => {
    playPopSound();

    const bubbleElement = document.querySelector(`[data-id="${bubble.id}"]`) as HTMLElement;
    if (bubbleElement) {
      const rect = bubbleElement.getBoundingClientRect();
      bubbleElement.style.position = 'fixed';
      bubbleElement.style.top = rect.top + 'px';
      bubbleElement.style.left = rect.left + 'px';
      bubbleElement.style.transform = 'none';
    }

    // 로컬에서 터지는 애니메이션 표시
    setBubbles(prevBubbles =>
      prevBubbles.map(b =>
        b.id === bubble.id ? { ...b, isPopping: true } : b
      )
    );

    // 300ms 후 Firebase에서 삭제
    setTimeout(async () => {
      try {
        await remove(ref(database, `rooms/${roomId}/bubbles/${bubble.firebaseId}`));
      } catch (error) {
        console.error('비눗방울 삭제 실패:', error);
      }
    }, 300);
  }

  // 인증되지 않은 경우 방 생성/입장 화면 표시
  if (!isAuthenticated) {
    return (
      <div className="App auth-screen">
        <div className="auth-container">
          <h1>🫧 HaiCChat 🫧</h1>
          <p>비눗방울 채팅에 오신 것을 환영합니다!</p>

          {/* 모드 선택 */}
          {!mode && (
            <div className="mode-selection">
              <button 
                onClick={() => setMode('create')} 
                className="mode-button create"
              >
                🏠 새로운 방 만들기
              </button>
              <button 
                onClick={() => setMode('join')} 
                className="mode-button join"
              >
                🚪 기존 방에 들어가기
              </button>
            </div>
          )}

          {/* 방 코드 입력 */}
          {mode && (
            <div className="room-form">
              <h3>
                {mode === 'create' ? '🏠 만들고자 하는 방의 이름을 입력해주세요' : '🚪 입장하고자 하는 방의 이름을 입력해주세요'}
              </h3>

              <div className="auth-form">
                <input
                  type="text"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                  placeholder={mode === 'create' ? '예: HAICCHAT' : '예: HAICCHAT'}
                  className="auth-input"
                />
                <button onClick={handleAuth} className="auth-button">
                  {mode === 'create' ? '방 만들기' : '입장하기'}
                </button>
              </div>

              <button 
                onClick={() => {
                  setMode('')
                  setAuthCode('')
                  setAuthError('')
                }} 
                className="back-button"
              >
                뒤로 가기
              </button>
            </div>
          )}

          {authError && (
            <div className="auth-error">{authError}</div>
          )}

          <div className="auth-hint">
            <p>방 이름은 영어, 한글, 숫자 모두 가능합니다</p>
            <p>최대 5명까지 친구들을 초대해보세요!</p>
          </div>
        </div>
      </div>
    )
  }

  // 사용자 선택 화면 (인증 후 사용자 미선택 상태)
  if (isAuthenticated && !currentUser) {
    return (
      <div className="App auth-screen">
        <div className="auth-container">
          <h1>🫧 사용자 선택 🫧</h1>
          <p>방 "{roomId}"에서 사용할 색상을 선택해주세요!</p>
          
          <div className="user-selection-grid">
            {Object.entries(userColors).map(([userId, color]) => {
              const isTaken = isUserColorTaken(color);
              return (
                <button
                  key={userId}
                  className={`user-selection-button ${color} ${isTaken ? 'taken' : ''}`}
                  onClick={() => !isTaken && setActiveUser(userId)}
                  disabled={isTaken}
                >
                  <div className="user-icon">
                    {userId === 'user1' ? '❤️' :
                     userId === 'user2' ? '💎' :
                     userId === 'user3' ? '🍏' :
                     userId === 'user4' ? '💜' : '😺'}
                  </div>
                  <div className="user-name">
                    {userId === 'user1' ? '핑크' :
                     userId === 'user2' ? '블루' :
                     userId === 'user3' ? '그린' :
                     userId === 'user4' ? '퍼플' : '옐로우'}
                  </div>
                  {isTaken && <div className="taken-indicator">사용중</div>}
                </button>
              );
            })}
          </div>

          <button onClick={handleLogout} className="back-button">
            뒤로 가기
          </button>
        </div>
      </div>
    );
  }

  // 인증된 경우 채팅 화면 표시
  console.log('render 시점 bubbles 길이:', bubbles.length);
  console.log('render 시점 bubbles 내용:', bubbles);

  // 방 삭제 함수
  const handleDeleteRoom = async () => {
    if (!roomId) return;
    
    const confirmDelete = window.confirm(`방 "${roomId}"을(를) 정말로 삭제하시겠습니까?\n\n⚠️ 이 방의 모든 메시지와 데이터가 영구적으로 삭제됩니다.`);
    
    if (confirmDelete) {
      try {
        // Firebase에서 방 전체 삭제
        await remove(ref(database, `rooms/${roomId}`));
        console.log('방 삭제됨:', roomId);
        
        // 로그아웃 처리 (모든 상태 초기화)
        setIsAuthenticated(false);
        setAuthCode('');
        setBubbles([]);
        setCurrentUser('');
        setActiveUsers({});
        setRoomId('');
        setMode('');
      } catch (error) {
        console.error('방 삭제 실패:', error);
        alert('방 삭제에 실패했습니다. 다시 시도해주세요.');
      }
    }
  };

  return (
    <div className="App">
      <h1>🫧 HaiCChat 🫧</h1>
      <div className="room-info">
        방: <strong>{roomId}</strong>
        <button onClick={handleDeleteRoom} className="delete-room-button" title="방 삭제">
          🗑️
        </button>
      </div>
      <button onClick={handleLogout} className="logout-button">
        로그아웃
      </button>

      <div className="user-selector">
        {Object.entries(userColors).map(([userId, color]) => {
          const isTaken = isUserColorTaken(color) && currentUser !== userId;
          return (
            <button
              key={userId}
              className={`${currentUser === userId ? 'active' : ''} ${color} ${isTaken ? 'disabled' : ''}`}
              onClick={() => !isTaken && handleUserChange(userId)}
              disabled={isTaken}
            >
              {userId === 'user1' ? '❤️ 핑크' :
               userId === 'user2' ? '💎 블루' :
               userId === 'user3' ? '🍏 그린' :
               userId === 'user4' ? '💜 퍼플' : '😺 옐로우'}
              {isTaken && <span className="taken-text"> (사용중)</span>}
            </button>
          );
        })}
      </div>

      <div className="bubble-container">
        {bubbles.map((bubble) => (
        <div
          key={bubble.firebaseId || bubble.id}
          data-id={bubble.id}
          className={`bubble ${bubble.color} ${bubble.isPopping ? 'popping' : ''}`}
          style={{ left: `${bubble.x}%` }}
          onClick={() => !bubble.isPopping && popBubble(bubble)}
          title={`사용자: ${bubble.text}`}
        >
          {bubble.text}
        </div>
      ))}
      </div>

      <div className="input-container">
        <span className="current-user-indicator">
          <span className={`user-badge ${userColors[currentUser as UserKey] || ''}`}>
            {currentUser === 'user1' ? '❤️' :
              currentUser === 'user2' ? '💎' :
                currentUser === 'user3' ? '🍏' :
                  currentUser === 'user4' ? '💜' :
                    currentUser === 'user5' ? '😺' : '사용자'}
          </span>
        </span>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="메시지를 입력하세요..."
        />
        <button onClick={sendMessage}>💌</button>
      </div>
    </div>
  )
}

export default App