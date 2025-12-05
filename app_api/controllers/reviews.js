// app_api/controllers/reviews.js
const mongoose = require('mongoose');
const Loc = mongoose.model('Location');

/* -------------------------- 공통 유틸: 입력 검증 -------------------------- */
// 공백/undefined/null -> ''로 정규화 후 trim
const asTrimmed = (v) => (typeof v === 'string' ? v.trim() : (v ?? ''));

/**
 * 리뷰 입력값 검증
 * - author: 비어있으면 안 됨 (공백만도 금지)
 * - reviewText: 비어있으면 안 됨 (공백만도 금지)
 * - rating: 숫자이며 0~5 범위
 * 실패 시 { ok:false, errors:{...} } 반환
 */
function validateReviewInput(body) {
    const errors = {};
    const author = asTrimmed(body.author);
    const reviewText = asTrimmed(body.reviewText);

    // rating 파싱 (문자열 '5' 허용, '', null, undefined는 실패)
    const ratingRaw = body.rating;
    const ratingNum = Number(ratingRaw);
    const hasRating = !(ratingRaw === '' || ratingRaw === null || ratingRaw === undefined);

    if (!author) errors.author = '작성자를 입력하세요.';
    if (!reviewText) errors.reviewText = '리뷰 내용을 입력하세요.';
    if (!hasRating || Number.isNaN(ratingNum)) {
        errors.rating = '평점을 숫자로 입력하세요.';
    } else if (ratingNum < 0 || ratingNum > 5) {
        errors.rating = '평점은 0 이상 5 이하여야 합니다.';
    }

    if (Object.keys(errors).length > 0) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        // 저장에 쓸 정규화된 값들
        normalized: {
            author,
            reviewText,
            rating: ratingNum
        }
    };
}

/* ---------------- 평균 평점 계산 후 저장 ---------------- */
const doSetAverageRating = async (location) => {
    if (location.reviews && location.reviews.length > 0) {
        const count = location.reviews.length;
        const total = location.reviews.reduce((acc, { rating }) => acc + rating, 0);
        location.rating = parseInt(total / count, 10);
        try {
            await location.save();
            console.log(`Average rating updated to ${location.rating}`);
        } catch (err) {
            console.log(err);
        }
    }
};

const updateAverageRating = async (locationId) => {
    try {
        const location = await Loc.findById(locationId).select('rating reviews').exec();
        if (location) {
            await doSetAverageRating(location);
        }
    } catch (err) {
        console.log(err);
    }
};

/* ----------------------------- 리뷰 추가 ----------------------------- */
const doAddReview = async (req, res, location) => {
    if (!location) {
        return res.status(404).json({ message: 'Location not found' });
    }

    // ✅ 선검증: 비어있는 값 / 잘못된 rating은 즉시 400
    const check = validateReviewInput(req.body);
    if (!check.ok) {
        return res.status(400).json({ message: 'validation failed', errors: check.errors });
    }
    const { author, rating, reviewText } = check.normalized;

    // 서브도큐먼트 푸시 (스키마가 있으면 추가 검증은 save 시에도 동작)
    location.reviews.push({ author, rating, reviewText });

    try {
        const updatedLocation = await location.save(); // ValidationError면 catch로
        await updateAverageRating(updatedLocation._id);
        const thisReview = updatedLocation.reviews.slice(-1).pop();
        return res.status(201).json(thisReview);
    } catch (err) {
        // (보너스) Mongoose ValidationError면 400 + 필드 메시지
        if (err && err.name === 'ValidationError' && err.errors) {
            const errors = Object.fromEntries(
                Object.entries(err.errors).map(([k, v]) => [k, v.message])
            );
            return res.status(400).json({ message: 'validation failed', errors });
        }
        return res.status(400).json(err);
    }
};

const reviewsCreate = async (req, res) => {
    const locationId = req.params.locationid;
    if (!locationId) {
        return res.status(404).json({ message: 'Location not found' });
    }

    try {
        const location = await Loc.findById(locationId).select('reviews').exec();
        if (location) {
            await doAddReview(req, res, location);
        } else {
            return res.status(404).json({ message: 'Location not found' });
        }
    } catch (err) {
        return res.status(400).json(err);
    }
};

/* --------------------------- 리뷰 단건 조회 --------------------------- */
const reviewsReadOne = async (req, res) => {
    try {
        const location = await Loc.findById(req.params.locationid)
            .select('name reviews')
            .exec();
        if (!location) {
            return res.status(404).json({ message: 'location not found' });
        }
        if (location.reviews && location.reviews.length > 0) {
            const review = location.reviews.id(req.params.reviewid);
            if (!review) {
                return res.status(404).json({ message: 'review not found' });
            }
            const response = {
                location: { name: location.name, id: req.params.locationid },
                review,
            };
            return res.status(200).json(response);
        } else {
            return res.status(404).json({ message: 'No reviews found' });
        }
    } catch (err) {
        return res.status(400).json(err);
    }
};

/* ----------------------------- 리뷰 수정 ----------------------------- */
const reviewsUpdateOne = async (req, res) => {
    if (!req.params.locationid || !req.params.reviewid) {
        return res
            .status(404)
            .json({ message: 'Not found, locationid and reviewid are both required' });
    }

    try {
        const location = await Loc.findById(req.params.locationid)
            .select('reviews')
            .exec();
        if (!location) {
            return res.status(404).json({ message: 'Location not found' });
        }

        if (location.reviews && location.reviews.length > 0) {
            const thisReview = location.reviews.id(req.params.reviewid);
            if (!thisReview) {
                return res.status(404).json({ message: 'Review not found' });
            }

            // ✅ 선검증: 넘어온 값만 대상으로 검증(부분 업데이트 허용)
            const nextAuthor = req.body.author !== undefined ? asTrimmed(req.body.author) : thisReview.author;
            const nextText = req.body.reviewText !== undefined ? asTrimmed(req.body.reviewText) : thisReview.reviewText;
            const nextRating = (req.body.rating !== undefined && req.body.rating !== null && req.body.rating !== '')
                ? Number(req.body.rating)
                : thisReview.rating;

            const patchCheck = validateReviewInput({ author: nextAuthor, reviewText: nextText, rating: nextRating });
            if (!patchCheck.ok) {
                return res.status(400).json({ message: 'validation failed', errors: patchCheck.errors });
            }

            // 적용
            thisReview.author = patchCheck.normalized.author;
            thisReview.reviewText = patchCheck.normalized.reviewText;
            thisReview.rating = patchCheck.normalized.rating;

            const updatedLocation = await location.save();
            await updateAverageRating(updatedLocation._id);
            return res.status(200).json(thisReview);
        } else {
            return res.status(404).json({ message: 'No review to update' });
        }
    } catch (err) {
        if (err && err.name === 'ValidationError' && err.errors) {
            const errors = Object.fromEntries(
                Object.entries(err.errors).map(([k, v]) => [k, v.message])
            );
            return res.status(400).json({ message: 'validation failed', errors });
        }
        return res.status(400).json(err);
    }
};

/* ----------------------------- 리뷰 삭제 ----------------------------- */
const reviewsDeleteOne = async (req, res) => {
    const { locationid, reviewid } = req.params;
    if (!locationid || !reviewid) {
        return res.status(404).json({ message: 'Not found, locationid and reviewid are both required' });
    }

    try {
        const location = await Loc.findById(locationid).select('reviews').exec();
        if (!location) {
            return res.status(404).json({ message: 'Location not found' });
        }

        const review = location.reviews.id(reviewid);
        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }

        // pull(reviewid)로 삭제
        location.reviews.pull(reviewid);

        await location.save();
        await updateAverageRating(location._id);

        return res.status(204).send();
    } catch (err) {
        console.error('reviewsDeleteOne error:', err);
        return res.status(400).json({ message: 'delete failed' });
    }
};

module.exports = {
    doSetAverageRating,
    updateAverageRating,
    doAddReview,
    reviewsCreate,
    reviewsReadOne,
    reviewsUpdateOne,
    reviewsDeleteOne
};
