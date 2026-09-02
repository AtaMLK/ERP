import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
export default class AuthService{constructor(private pool:Pool){}
 async login(email:string,password:string){const r=await this.pool.query('SELECT id,email,name,password_hash FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL',[email.trim()]);const u=r.rows[0];if(!u||!(await bcrypt.compare(password,u.password_hash)))throw new Error('Invalid credentials');const secret=process.env.JWT_SECRET;if(!secret)throw new Error('JWT_SECRET is not configured');const token=jwt.sign({userId:u.id,email:u.email},secret,{expiresIn:'8h',issuer:'fz-erp'});return {user:{id:u.id,email:u.email,name:u.name},token};}
}