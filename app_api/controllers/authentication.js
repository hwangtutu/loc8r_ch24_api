const passport = require('passport');
const mongoose = require('mongoose');
const User = mongoose.model('User');

const register = async (req, res) => {
    const { name, email, password } = req.body ?? {};

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'All fields required' });
    }

    try {
        const user = new User({
            name,
            email: String(email).trim(), // 필요하면 .toLowerCase()로 통일 추천
        });

        user.setPassword(password);
        await user.save();

        const token = user.generateJwt(); // JWT_SECRET 없으면 여기서 터짐
        return res.status(200).json({ token });
    } catch (err) {
        console.error('[register] error:', err);

        if (err?.code === 11000) {
            return res.status(409).json({ message: 'Email already exists' });
        }

        return res.status(500).json({
            message: err?.message ?? 'Server error',
            name: err?.name,
            code: err?.code,
        });
    }
};

const login = (req, res) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
        return res.status(400).json({ message: 'All fields required' });
    }

    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('[login] passport err:', err);
            return res.status(500).json({ message: err.message || 'passport error' });
        }

        if (!user) {
            return res.status(401).json(info || { message: 'Login failed' });
        }

        try {
            const token = user.generateJwt(); // JWT_SECRET 없으면 여기서 터짐
            return res.status(200).json({ token });
        } catch (e) {
            console.error('[login] jwt error:', e);
            return res.status(500).json({ message: e.message || 'jwt error' });
        }
    })(req, res);
};

module.exports = { register, login };
