const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const supabase = require('../supabaseClient');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET;

// --- HÀM GỬI EMAIL THÔNG BÁO TÀI KHOẢN MỚI ---
async function sendRegisterNotification(username) {
    let transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // true cho port 465
        auth: {
            user: 'nguyenquocviet2018ca@gmail.com',
            pass: 'pehvreeenoyeqocz' // App Password của Gmail
        }
    });

    let mailOptions = {
        from: 'nguyenquocviet2018ca@gmail.com',
        to: 'nguyenquocviet2018ca@gmail.com',
        subject: '📢 [Thông báo] Có thành viên mới đăng ký tài khoản!',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; max-width: 500px;">
                <h2 style="color: #667eea; margin-top: 0;">Thông báo tài khoản mới</h2>
                <p>Hệ thống vừa ghi nhận một thành viên mới đăng ký thành công:</p>
                <ul style="line-height: 1.6;">
                    <li><strong>Tên đăng nhập:</strong> <span style="color: #2e7d32; font-weight: bold;">${username}</span></li>
                    <li><strong>Thời gian:</strong> ${new Date().toLocaleString('vi-VN')}</li>
                </ul>
                <p style="font-size: 12px; color: #777; margin-bottom: 0;">Email tự động được gửi từ hệ thống Chat Web Socket.</p>
            </div>
        `
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log('✅ Gửi email thông báo thành công! Message ID:', info.messageId);
    } catch (error) {
        console.error('❌ Gửi email thất bại:', error);
    }
    
}

// 1. API Đăng ký
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password: hashedPassword }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    // --- GỌI HÀM GỬI EMAIL THÔNG BÁO CHO ADMIN ---
   await sendRegisterNotification(username);

    res.json({ message: "Đăng ký thành công!", user: data[0] });
  } catch (err) {
    console.error("Lỗi đăng ký:", err);
    res.status(500).json({ error: "Lỗi Server nội bộ" });
  }
});

// 2. API Đăng nhập
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin!" });
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !data) return res.status(400).json({ error: "Tài khoản không tồn tại!" });

    const isValidPassword = await bcrypt.compare(password, data.password);
    if (!isValidPassword) return res.status(401).json({ error: "Sai mật khẩu!" });

    const token = jwt.sign({ id: data.id, username: data.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: "Đăng nhập thành công", token });
  } catch (err) {
    res.status(500).json({ error: "Lỗi Server nội bộ" });
  }
});

module.exports = router;