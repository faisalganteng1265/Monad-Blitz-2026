import { useState, useEffect } from 'react';
import { keccak256, toHex, hashMessage, recoverMessageAddress, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface SessionKey {
  privateKey: `0x${string}`;
  address: string;
  expiresAt: number;
  authorizedBy: string;
  authSignature: string;
  createdAt: number;
}

const SESSION_STORAGE_KEY = 'tethra_session_key';
const DEFAULT_SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

export function useSessionKey() {
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load session key from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      try {
        const parsed: SessionKey = JSON.parse(stored);
        // Check if expired
        if (parsed.expiresAt > Date.now()) {
          setSessionKey(parsed);
        } else {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch (err) {
        console.error('Failed to parse session key:', err);
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  }, []);

  /**
   * Check if current session is valid (exists and not expired)
   */
  const isSessionValid = (): boolean => {
    if (!sessionKey) return false;
    if (sessionKey.expiresAt <= Date.now()) {
      clearSession();
      return false;
    }
    return true;
  };

  /**
   * Create a new session key
   * User must sign a message authorizing this ephemeral key
   */
  const createSession = async (
    userAddress: string,
    walletClient: any,
    durationMs: number = DEFAULT_SESSION_DURATION,
  ): Promise<SessionKey | null> => {
    try {
      setIsLoading(true);

      // Generate random private key for session
      const randomBytes = crypto.getRandomValues(new Uint8Array(32));
      const privateKey = `0x${Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')}` as `0x${string}`;

      // Derive address from private key
      const sessionAccount = privateKeyToAccount(privateKey);
      const sessionAddress = sessionAccount.address;

      const expiresAt = Date.now() + durationMs;
      const expiresAtSeconds = Math.floor(expiresAt / 1000);

      const authMessageHash = keccak256(
        encodePacked(
          ['string', 'address', 'string', 'uint256'],
          [
            'Authorize session key ',
            sessionAddress as `0x${string}`,
            ' for Tethra Tap-to-Trade until ',
            BigInt(expiresAtSeconds),
          ],
        ),
      );

      // User signs authorization (this is the ONLY signature needed!)
      const authSignature = await walletClient.request({
        method: 'personal_sign',
        params: [authMessageHash, userAddress],
      });

      const newSession: SessionKey = {
        privateKey,
        address: sessionAddress,
        expiresAt,
        authorizedBy: userAddress.toLowerCase(),
        authSignature: authSignature as string,
        createdAt: Date.now(),
      };

      // Store in state and localStorage
      setSessionKey(newSession);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));

      return newSession;
    } catch (err: any) {
      console.error('Session creation failed:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Sign a message using the session key (no user prompt!)
   * IMPORTANT: Uses hashMessage to match ethers.verifyMessage behavior
   */
  const signWithSession = async (messageHash: `0x${string}`): Promise<string | null> => {
    if (!isSessionValid()) {
      return null;
    }

    try {
      const sessionAccount = privateKeyToAccount(sessionKey!.privateKey);

      // Hash the message with Ethereum signed message prefix
      // This creates the same hash that ethers.verifyMessage expects
      const digest = hashMessage({ raw: messageHash });

      // Sign the digest using raw ECDSA (no additional hashing)
      const signature = await sessionAccount.sign({ hash: digest });

      return signature;
    } catch (err) {
      console.error('Failed to sign with session:', err);
      return null;
    }
  };

  /**
   * Clear current session
   */
  const clearSession = () => {
    setSessionKey(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  /**
   * Get time remaining in session (milliseconds)
   */
  const getTimeRemaining = (): number => {
    if (!sessionKey) return 0;
    return Math.max(0, sessionKey.expiresAt - Date.now());
  };

  return {
    sessionKey,
    isSessionValid,
    createSession,
    signWithSession,
    clearSession,
    getTimeRemaining,
    isLoading,
  };
}
