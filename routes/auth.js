const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const supabase = require('../supabaseClient');

const JWT_SECRET = process.env.JWT_SECRET;

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

    // --- GỬI EMAIL THÔNG BÁO CHO ADMIN ---
    const transporter = req.app.locals.transporter;
    const adminEmail = req.app.locals.ADMIN_EMAIL;

    if (transporter && adminEmail) {
      const mailOptions = {
        from: '"Hệ thống Chat App" <nguyenquocviet2018ca@gmail.com>',
        to: adminEmail,
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

      transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
          console.error("Lỗi khi gửi email thông báo cho Admin:", err);
        } else {
          console.log("Đã gửi email thông báo thành công:", info.response);
        }
      });
    }

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