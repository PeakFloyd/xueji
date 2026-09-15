package xueji.entity;

/**
 * 课程实体，对应数据库表 course。
 */
public class Course {

    /** 课程号（主键）。 */
    private String courseId;

    /** 课程名。 */
    private String courseName;

    /** 学分。 */
    private int credit;

    public Course() {
    }

    public Course(String courseId, String courseName, int credit) {
        this.courseId = courseId;
        this.courseName = courseName;
        this.credit = credit;
    }

    public String getCourseId() {
        return courseId;
    }

    public void setCourseId(String courseId) {
        this.courseId = courseId;
    }

    public String getCourseName() {
        return courseName;
    }

    public void setCourseName(String courseName) {
        this.courseName = courseName;
    }

    public int getCredit() {
        return credit;
    }

    public void setCredit(int credit) {
        this.credit = credit;
    }

    @Override
    public String toString() {
        return courseName == null ? courseId : courseName;
    }
}
