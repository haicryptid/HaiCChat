import { useState, useEffect } from 'react'
import { database } from './firebase'
import { ref, push, onValue, remove, set } from 'firebase/database'
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

  // 허용된 코드들
  const VALID_CODES = ['HAICCHAT', 'SUMINBUTT', 'BUBBLETIME', 'LOVETEXT', '천문학적으로 사랑해']

  const userColors: Record<UserKey, string> = {
    user1: 'pink',
    user2: 'blue',
    user3: 'green',
    user4: 'purple',
    user5: 'yellow'
  }

  // Firebase에서 실시간 데이터 감지
  useEffect(() => {
    if (!isAuthenticated) return;

    const bubblesRef = ref(database, 'bubbles');

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
  }, [isAuthenticated]);

  // 활성 사용자들 실시간 감지
  useEffect(() => {
    if (!isAuthenticated) return;

    const activeUsersRef = ref(database, 'activeUsers');
    
    const unsubscribe = onValue(activeUsersRef, (snapshot) => {
      const data = snapshot.val() || {};
      console.log('활성 사용자 데이터:', data);
      setActiveUsers(data);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  // 페이지 떠날 때만 사용자 정보 제거 (색상 변경과 분리)
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;

    const handleBeforeUnload = () => {
      // 실제 페이지를 떠날 때만 제거
      navigator.sendBeacon(`https://haicchat-default-rtdb.asia-southeast1.firebasedatabase.app/activeUsers/${sessionId}.json`, 
        JSON.stringify(null));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // 컴포넌트 언마운트 시에만 사용자 제거 (색상 변경과 구분)
    };
  }, [sessionId]); // currentUser 의존성 제거

  // 인증 시도
  const handleAuth = () => {
    if (VALID_CODES.includes(authCode.toUpperCase())) {
      setIsAuthenticated(true)
      setAuthError('')
    } else {
      setAuthError('잘못된 인증 코드입니다')
      setAuthCode('')
    }
  }

  // 활성 사용자 등록
  const setActiveUser = async (userId: string) => {
    try {
      setCurrentUser(userId);
      
      const userRef = ref(database, `activeUsers/${sessionId}`);
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
      await remove(ref(database, `activeUsers/${sessionId}`));
    } catch (error) {
      console.error('로그아웃 시 사용자 제거 실패:', error);
    }
    
    setIsAuthenticated(false)
    setAuthCode('')
    setBubbles([])
    setCurrentUser('')
    setActiveUsers({})
  }

  // 사용자 변경
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
      
      // Firebase 업데이트
      const userRef = ref(database, `activeUsers/${sessionId}`);
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

  // Firebase에 메시지 보내기
  const sendMessage = async () => {
    if (message.trim() && currentUser) {
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
        await push(ref(database, 'bubbles'), newBubble);
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

  // Firebase에서 비눗방울 삭제
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
        await remove(ref(database, `bubbles/${bubble.firebaseId}`));
      } catch (error) {
        console.error('비눗방울 삭제 실패:', error);
      }
    }, 300);
  }

  // 인증되지 않은 경우 로그인 화면 표시
  if (!isAuthenticated) {
    return (
      <div className="App auth-screen">
        <div className="auth-container">
          <h1>🫧 HaiCChat 🫧</h1>
          <p>비눗방울 채팅에 오신 것을 환영합니다!</p>

          <div className="auth-form">
            <input
              type="text"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
              placeholder="인증 코드를 입력하세요"
              className="auth-input"
            />
            <button onClick={handleAuth} className="auth-button">
              입장하기
            </button>
          </div>

          {authError && (
            <div className="auth-error">{authError}</div>
          )}

          <div className="auth-hint">
            <p>코드는 대소문자를 구분하지 않습니다</p>
            <p>테스트 코드: HAICCHAT, BUBBLETIME, LOVETEXT, SUMINBUTT</p>
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
          <p>사용할 색상을 선택해주세요!</p>
          
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

  return (
    <div className="App">
      <h1>🫧 HaiCChat 🫧</h1>
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