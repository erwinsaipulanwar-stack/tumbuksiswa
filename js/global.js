document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. HAMBURGER MENU (MOBILE NAVIGATION)
    // ==========================================
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            menuToggle.classList.toggle('active');
        });
    }

    // ==========================================
    // 2. HERO SLIDER AUTOMATIC (Jika Ada)
    // ==========================================
    const slides = document.querySelectorAll('.hero-slider .slide');
    let currentSlide = 0;

    function nextSlide() {
        if (slides.length === 0) return;
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }

    if (slides.length > 0) {
        setInterval(nextSlide, 4000); // Ganti slide tiap 4 detik
    }

    // ==========================================
    // 3. LIGHTBOX GALLERY INTERACTIVE
    // ==========================================
    const galleryImages = document.querySelectorAll('.gallery-grid img, .main-gallery-grid img');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const closeBtn = document.querySelector('.lightbox-close');
    const prevBtn = document.querySelector('.lightbox-prev');
    const nextBtn = document.querySelector('.lightbox-next');
    let activeImageIndex = 0;

    function bukaLightbox(index) {
        if (!lightboxImg || !lightbox) return;
        activeImageIndex = index;
        lightboxImg.src = galleryImages[activeImageIndex].src;
        lightbox.style.display = 'flex';
    }

    function geserFoto(arah) {
        if (!lightboxImg) return;
        activeImageIndex += arah;
        if (activeImageIndex >= galleryImages.length) activeImageIndex = 0;
        if (activeImageIndex < 0) activeImageIndex = galleryImages.length - 1;
        lightboxImg.src = galleryImages[activeImageIndex].src;
    }

    // Pasang click event ke semua foto galeri
    galleryImages.forEach((img, index) => {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => bukaLightbox(index));
    });

    // Pasang tombol kontrol lightbox
    if (nextBtn && prevBtn && closeBtn && lightbox) {
        nextBtn.addEventListener('click', () => geserFoto(1));
        prevBtn.addEventListener('click', () => geserFoto(-1));
        closeBtn.addEventListener('click', () => { lightbox.style.display = 'none'; });
        
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) lightbox.style.display = 'none';
        });
    }
});