//  时间格式化函数，返回 YYYY.MM.DD 格式的字符串
export const momentm = (date: Date): string => {
    const dateNew = new Date(date)
    // 获取年份
    const year = dateNew.getFullYear();
    // 获取月份（注意：getMonth() 返回 0-11，需要加 1）
    const month = String(dateNew.getMonth() + 1).padStart(2, '0');
    // 获取日期
    const day = String(dateNew.getDate()).padStart(2, '0');

    // 返回格式化后的字符串
    return `${year}-${month}-${day}`;
}

// 时间格式化函数，返回 YYYY-MM-DD HH:MM:SS 格式的字符串
export const momentl = (date: Date): string => {
    const dateNew = new Date(date);
    // 获取年份
    const year = dateNew.getFullYear();
    // 获取月份（getMonth() 返回 0-11，需加 1）
    const month = String(dateNew.getMonth() + 1).padStart(2, '0');
    // 获取日期
    const day = String(dateNew.getDate()).padStart(2, '0');
    // 获取小时（24小时制）
    const hours = String(dateNew.getHours()).padStart(2, '0');
    // 获取分钟
    const minutes = String(dateNew.getMinutes()).padStart(2, '0');
    // 获取秒
    const seconds = String(dateNew.getSeconds()).padStart(2, '0');

    // 返回格式化后的字符串
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// 时间格式化函数，返回 HH:MM:SS 格式的字符串
export const momentDay = (date: Date): string => {
    const dateNew = new Date(date);

    // 获取小时（24小时制）
    const hours = String(dateNew.getHours()).padStart(2, '0');
    // 获取分钟
    const minutes = String(dateNew.getMinutes()).padStart(2, '0');
    // 获取秒
    const seconds = String(dateNew.getSeconds()).padStart(2, '0');

    // 返回格式化后的字符串
    return `${hours}:${minutes}:${seconds}`;
};