package xueji.entity;

/**
 * 教师实体，对应数据库表 teacher。
 *
 * <p>教师归属于某个系（系号外键）。管理员是常量教师号 {@code T001}，
 * 其本身也是一位教师（见 docs/设计说明.md）。</p>
 */
public class Teacher {

    /** 教师号（主键）。 */
    private String teacherId;

    /** 教师姓名。 */
    private String teacherName;

    /** 所属系号（外键）。 */
    private String deptId;

    public Teacher() {
    }

    public Teacher(String teacherId, String teacherName, String deptId) {
        this.teacherId = teacherId;
        this.teacherName = teacherName;
        this.deptId = deptId;
    }

    public String getTeacherId() {
        return teacherId;
    }

    public void setTeacherId(String teacherId) {
        this.teacherId = teacherId;
    }

    public String getTeacherName() {
        return teacherName;
    }

    public void setTeacherName(String teacherName) {
        this.teacherName = teacherName;
    }

    public String getDeptId() {
        return deptId;
    }

    public void setDeptId(String deptId) {
        this.deptId = deptId;
    }

    @Override
    public String toString() {
        return teacherName == null ? teacherId : teacherName;
    }
}
