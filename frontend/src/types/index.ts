export interface User {
  id: string;
  username: string;
  email: string;
}

export interface Message {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: Date;
}

export interface AuthResponse {
  token: string;
  user: User;
}
