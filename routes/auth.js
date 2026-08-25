const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const supabase = require('../supabaseClient');


const JWT_SECRET = process.env.JWT_SECRET;

// --- HÀM GỬI EMAIL THÔNG BÁO TÀI KHOẢN MỚI ---

// 1. API Đăng ký
// 1. Biến toàn cục lưu trạng thái khóa đăng ký (mặc định là mở: false)
router.post('/register', async (req, res) => {
// Kiểm tra trạng thái khóa từ biến toàn cục app.locals của Express
    if (req.app.locals.isRegistrationLocked) {
        return res.status(403).json({ message: "Hệ thống đang khóa tính năng đăng ký tài khoản mới bởi quản trị viên!" });
    }

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