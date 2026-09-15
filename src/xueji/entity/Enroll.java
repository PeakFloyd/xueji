package xueji.entity;

/**
 * 选修(选课)实体，对应数据库表 enroll。
 * 表示"某学生选修某门课程"这一 m:n 联系，复合主键为 (学号, 课程号)。
 */
public class Enroll {

    /** 学号（复合主键之一，外键）。 */
    private String stuId;

    /** 课程号（复合主键之一，外键）。 */
    private String courseId;

    /** 成绩。 */
    private Double score;

    /** 学生姓名（联表查询展示用，非表字段）。 */
    private String stuName;

    /** 课程名（联表查询展示用，非表字段）。 */
    private String courseName;

    public Enroll() {
    }

    public Enroll(String stuId, String courseId, Double score) {
        this.stuId = stuId;
        this.courseId = courseId;
        this.score = score;
    }

    public String getStuId() {
        return stuId;
    }

    public void setStuId(String stuId) {
        this.stuId = stuId;
    }

    public String getCourseId() {
        return courseId;
    }

    public void setCourseId(String courseId) {
        this.courseId = courseId;
    }

    public Double getScore() {
        return score;
    }

    public void setScore(Double score) {
        this.score = score;
    }

    public String getStuName() {
        return stuName;
    }

    public void setStuName(String stuName) {
        this.stuName = stuName;
    }

    public String getCourseName() {
        return courseName;
    }

    public void setCourseName(String courseName) {
        this.courseName = courseName;
    }
}
